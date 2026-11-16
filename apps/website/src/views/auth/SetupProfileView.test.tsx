// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { SetupProfileView } from "./SetupProfileView";
import { renderWithRouter, setNativeValue } from "../../test/test-utils";
import * as AppContextModule from "../../context/AppContext";
import { supabase } from "../../supabase";

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

  it("upserts profile without overwriting email column (#128)", async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: upsertMock,
    } as any);

    const { container, unmount } = renderWithRouter(<SetupProfileView />, {
      route: "/setup-profile",
    });

    const displayInput = container.querySelector("#setup-display-name") as HTMLInputElement;
    const usernameInput = container.querySelector("#setup-username") as HTMLInputElement;

    act(() => {
      setNativeValue(displayInput, "テストユーザー");
      setNativeValue(usernameInput, "test_user_1");
    });

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(upsertMock).toHaveBeenCalledTimes(1);
    const payload = upsertMock.mock.calls[0][0];
    expect(payload).toEqual({
      id: "u1",
      display_name: "テストユーザー",
      username: "test_user_1",
      avatar_url: undefined,
    });
    expect("email" in payload).toBe(false);

    unmount();
  });

  it("redirects unauthenticated guests to login, syncs displayName after authLoading, and navigates on logout", async () => {
    const mockNavigate = vi.fn();
    const useAppSpy = vi.spyOn(AppContextModule, "useApp");

    // 1. ゲスト状態ではフォームを表示せず login へ遷移すること
    useAppSpy.mockReturnValue({
      user: null,
      profile: null,
      authLoading: false,
      setProfile: vi.fn(),
      showToast: vi.fn(),
      navigate: mockNavigate,
    } as any);

    const guestRender = renderWithRouter(<SetupProfileView />, { route: "/setup-profile" });
    expect(guestRender.container.querySelector("form")).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("login");
    guestRender.unmount();

    // 2. authLoading 完了後に到着した profile.display_name を同期し、ログアウトで login へ遷移すること
    mockNavigate.mockReset();
    const signOutSpy = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null });

    useAppSpy.mockReturnValue({
      user: { id: "u1" },
      profile: null,
      authLoading: true,
      setProfile: vi.fn(),
      showToast: vi.fn(),
      navigate: mockNavigate,
    } as any);

    const authedRender = renderWithRouter(<SetupProfileView />, { route: "/setup-profile" });
    expect(authedRender.container.querySelector("#setup-display-name")).toBeNull();

    useAppSpy.mockReturnValue({
      user: { id: "u1" },
      profile: { id: "u1", email: "test@example.com", display_name: "初期表示名" },
      authLoading: false,
      setProfile: vi.fn(),
      showToast: vi.fn(),
      navigate: mockNavigate,
    } as any);

    authedRender.rerender(<SetupProfileView />);
    const displayInput = authedRender.container.querySelector(
      "#setup-display-name",
    ) as HTMLInputElement;
    expect(displayInput.value).toBe("初期表示名");

    const logoutBtn = Array.from(authedRender.container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ログアウト"),
    )!;
    await act(async () => {
      logoutBtn.click();
    });
    expect(signOutSpy).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("login");

    authedRender.unmount();
  });
});
