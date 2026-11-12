// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { SetupProfileView } from "./SetupProfileView";
import { renderWithRouter } from "../../test/test-utils";
import * as AppContextModule from "../../context/AppContext";

describe("SetupProfileView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: { id: "u1", email: "test@example.com", display_name: "" },
      setProfile: vi.fn(),
      showToast: vi.fn(),
      navigate: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("associates labels, hint aria-describedby, and role=alert error state", async () => {
    const { container, unmount } = renderWithRouter(<SetupProfileView />, {
      route: "/setup-profile",
    });

    expect(container.querySelector('label[for="setup-display-name"]')).not.toBeNull();
    expect(container.querySelector('label[for="setup-username"]')).not.toBeNull();

    const displayInput = container.querySelector("#setup-display-name") as HTMLInputElement;
    const usernameInput = container.querySelector("#setup-username") as HTMLInputElement;

    expect(displayInput.required).toBe(true);
    expect(usernameInput.required).toBe(true);
    expect(usernameInput.getAttribute("aria-describedby")).toBe("setup-username-hint");

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl?.id).toBe("setup-profile-error");
    expect(displayInput.getAttribute("aria-invalid")).toBe("true");
    expect(displayInput.getAttribute("aria-describedby")).toBe("setup-profile-error");
    expect(usernameInput.getAttribute("aria-describedby")).toBe(
      "setup-profile-error setup-username-hint",
    );

    unmount();
  });
});
