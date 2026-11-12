// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { BrowserRouter } from "react-router-dom";
import { AccessDeniedView } from "./AccessDeniedView";
import * as AppContextModule from "../../context/AppContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("AccessDeniedView", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
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

  it("navigates to /writer-apply when viewer accesses writer dashboard", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      user: { id: "viewer-user-id" } as any,
      profile: { role: "viewer", roles: ["viewer"] } as any,
    } as any);

    act(() => {
      root!.render(
        <BrowserRouter>
          <AccessDeniedView requiredRole="writer" />
        </BrowserRouter>,
      );
    });

    expect(container.textContent).toContain(
      "記事の執筆を希望される場合は、ライター応募フォームよりご申請ください",
    );
    const applyButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("ライターに応募する"),
    );
    expect(applyButton).toBeDefined();

    act(() => {
      applyButton!.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/writer-apply");
  });

  it("navigates to /contact when viewer accesses editor dashboard", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      user: { id: "viewer-user-id" } as any,
      profile: { role: "viewer", roles: ["viewer"] } as any,
    } as any);

    act(() => {
      root!.render(
        <BrowserRouter>
          <AccessDeniedView requiredRole="editor" />
        </BrowserRouter>,
      );
    });

    const contactButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("お問い合わせ"),
    );
    expect(contactButton).toBeDefined();

    act(() => {
      contactButton!.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/contact");
  });

  it("shows login button when user is unauthenticated", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      user: null,
      profile: null,
    } as any);

    act(() => {
      root!.render(
        <BrowserRouter>
          <AccessDeniedView requiredRole="writer" />
        </BrowserRouter>,
      );
    });

    const loginButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("ログインする"),
    );
    expect(loginButton).toBeDefined();

    act(() => {
      loginButton!.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("uses WCAG AA compliant contrast classes for fallback support guidance", () => {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      user: { id: "writer-user-id" } as any,
      profile: { role: "writer", roles: ["writer"] } as any,
    } as any);

    act(() => {
      root!.render(
        <BrowserRouter>
          <AccessDeniedView requiredRole="editor" />
        </BrowserRouter>,
      );
    });

    const guidance = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes(
        "アカウントの権限設定に関するお問い合わせはサポートまでご連絡ください",
      ),
    );
    expect(guidance?.className).toContain("text-gray-500");
    expect(guidance?.className).toContain("dark:text-gray-400");
    expect(guidance?.className).not.toContain("dark:text-gray-500");
  });
});
