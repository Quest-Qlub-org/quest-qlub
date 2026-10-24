/* eslint-disable @typescript-eslint/unbound-method */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { Routes, Route } from "react-router-dom";
import { AppLayout } from "./AppLayout";
import { renderWithRouter } from "../../test/test-utils";
import * as AuthContextModule from "../../context/AuthContext";
import { supabase } from "../../supabase";

describe("AppLayout Root-level MFA Barrier", () => {
  let mockSetMfaChallengeRequired: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSetMfaChallengeRequired = vi.fn();
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: {
        all: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
        totp: [{ id: "factor-1", status: "verified" }],
      } as any,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("completely unmounts and isolates Outlet content when mfaChallengeRequired is true", () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "viewer",
      authLoading: false,
      user: { id: "user-1", email: "user@example.com" } as any,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: true,
      setMfaChallengeRequired: mockSetMfaChallengeRequired,
      refreshProfile: vi.fn(),
    } as any);

    const { container, unmount } = renderWithRouter(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div id="secret-content">秘密のメインページコンテンツ</div>} />
        </Route>
      </Routes>,
      { route: "/" },
    );

    // 脆弱性の完全遮断: 検証ツールで何を消しても裏のコンテンツが見えないよう、
    // Outlet（secret-content）が DOM 内に一切存在しないことを検証
    expect(container.querySelector("#secret-content")).toBeNull();
    expect(container.textContent).not.toContain("秘密のメインページコンテンツ");

    // 2FAチャレンジ画面（Barrier）が表示されていること
    expect(container.textContent).toContain("2段階認証の確認");

    unmount();
  });

  it("renders Outlet normally when mfaChallengeRequired is false", () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "viewer",
      authLoading: false,
      user: { id: "user-1", email: "user@example.com" } as any,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: false,
      setMfaChallengeRequired: mockSetMfaChallengeRequired,
      refreshProfile: vi.fn(),
    } as any);

    const { container, unmount } = renderWithRouter(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div id="normal-content">公開トップページコンテンツ</div>} />
        </Route>
      </Routes>,
      { route: "/" },
    );

    expect(container.querySelector("#normal-content")).not.toBeNull();
    expect(container.textContent).toContain("公開トップページコンテンツ");
    expect(container.textContent).not.toContain("2段階認証の確認");

    unmount();
  });

  it("calls signOut and resets session when canceling from MFA barrier", async () => {
    vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null });

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "viewer",
      authLoading: false,
      user: { id: "user-1", email: "user@example.com" } as any,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: true,
      setMfaChallengeRequired: mockSetMfaChallengeRequired,
      refreshProfile: vi.fn(),
    } as any);

    const { container, unmount } = renderWithRouter(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>メインページ</div>} />
        </Route>
      </Routes>,
      { route: "/" },
    );

    await act(async () => {
      await Promise.resolve();
    });

    const cancelBtn = Array.from(container.querySelectorAll("button")).find(
      (b) =>
        b.textContent?.includes("別のアカウントでログイン") ||
        b.textContent?.includes("キャンセル"),
    );
    expect(cancelBtn).not.toBeUndefined();

    await act(async () => {
      cancelBtn!.click();
    });

    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(mockSetMfaChallengeRequired).toHaveBeenCalledWith(false);

    unmount();
  });

  it("does not unmount LoginView on /login route when mfaChallengeRequired becomes true (prevents login loop)", () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "viewer",
      authLoading: false,
      user: { id: "user-1", email: "user@example.com" } as any,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: true,
      setMfaChallengeRequired: mockSetMfaChallengeRequired,
      refreshProfile: vi.fn(),
    } as any);

    const { container, unmount } = renderWithRouter(
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/login"
            element={<div id="inline-login-view">インライン2FAログイン画面</div>}
          />
        </Route>
      </Routes>,
      { route: "/login" },
    );

    // /login ルート上では AppLayout の Barrier で LoginView をアンマウントせず、LoginView 自身のインライン2FAを維持すること
    expect(container.querySelector("#inline-login-view")).not.toBeNull();
    expect(container.textContent).toContain("インライン2FAログイン画面");

    unmount();
  });

  it("renders official X link targeting https://x.com/QuestQlub", () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "viewer",
      authLoading: false,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: false,
      setMfaChallengeRequired: mockSetMfaChallengeRequired,
      refreshProfile: vi.fn(),
    } as any);

    const { container, unmount } = renderWithRouter(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>テストコンテンツ</div>} />
        </Route>
      </Routes>,
      { route: "/" },
    );

    const xLink = container.querySelector('a[href="https://x.com/QuestQlub"]');
    expect(xLink).not.toBeNull();
    expect(xLink?.textContent).toContain("公式X (@QuestQlub)");

    unmount();
  });
});
