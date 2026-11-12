// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { CollaboratorSelect } from "./CollaboratorSelect";
import * as AppContextModule from "../context/AppContext";
import { createTestProfile, setNativeValue } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CollaboratorSelect", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  const mockWriter1 = createTestProfile({
    id: "w-1",
    role: "writer",
    display_name: "ライター1",
    username: "writer1",
  });
  const mockWriter2 = createTestProfile({
    id: "w-2",
    role: "writer",
    display_name: "ライター2",
    username: "writer2",
  });
  const mockWriter3 = createTestProfile({
    id: "w-3",
    role: "writer",
    display_name: "ライター3",
    username: "writer3",
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      writers: [mockWriter1, mockWriter2, mockWriter3],
    } as any);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it("renders available writers excluding current user and already selected writers", async () => {
    const handleChange = vi.fn();

    await act(async () => {
      root!.render(
        <CollaboratorSelect
          value={["w-2"]}
          onChange={handleChange}
          excludeUserIds={["w-1"]}
          label="共同編集者"
        />,
      );
    });

    expect(container.textContent).toContain("共同編集者");
    // Selected writer badge
    expect(container.textContent).toContain("ライター2");

    const select = container.querySelector(
      "select[data-testid='collaborator-select-input']",
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();

    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    // Should contain "" (placeholder) and "w-3" (not excluded and not selected)
    // Should NOT contain "w-1" (excluded) or "w-2" (already selected)
    expect(options).toContain("");
    expect(options).toContain("w-3");
    expect(options).not.toContain("w-1");
    expect(options).not.toContain("w-2");
  });

  it("calls onChange when selecting a new collaborator", async () => {
    const handleChange = vi.fn();

    await act(async () => {
      root!.render(
        <CollaboratorSelect value={[]} onChange={handleChange} excludeUserIds={["w-1"]} />,
      );
    });

    const select = container.querySelector(
      "select[data-testid='collaborator-select-input']",
    ) as HTMLSelectElement;

    act(() => {
      setNativeValue(select, "w-2");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith(["w-2"]);
  });

  it("calls onChange when removing a collaborator via remove button", async () => {
    const handleChange = vi.fn();

    await act(async () => {
      root!.render(
        <CollaboratorSelect
          value={["w-2", "w-3"]}
          onChange={handleChange}
          excludeUserIds={["w-1"]}
        />,
      );
    });

    const removeBtn = container.querySelector(
      "button[data-testid='remove-collaborator-w-2']",
    ) as HTMLButtonElement;
    expect(removeBtn).toBeTruthy();
    expect(removeBtn.className).toContain("focus-visible:ring-2");

    act(() => {
      removeBtn.click();
    });

    expect(handleChange).toHaveBeenCalledWith(["w-3"]);
  });

  it("excludes viewer users from available collaborators even if present in user list", async () => {
    const mockViewer = createTestProfile({
      id: "viewer-1",
      role: "viewer",
      display_name: "一般読者",
    });

    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      writers: [mockWriter1, mockWriter2, mockViewer],
    } as any);

    await act(async () => {
      root!.render(<CollaboratorSelect value={[]} onChange={vi.fn()} excludeUserIds={["w-1"]} />);
    });

    const select = container.querySelector(
      "select[data-testid='collaborator-select-input']",
    ) as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);

    expect(options).toContain("w-2");
    expect(options).not.toContain("viewer-1");
  });
});
