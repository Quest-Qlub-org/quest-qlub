/* eslint-disable @typescript-eslint/unbound-method */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { LoginView } from "./LoginView";
import { renderWithRouter, setNativeValue } from "../../test/test-utils";
import { supabase } from "../../supabase";
import * as AppContextModule from "../../context/AppContext";

describe("LoginView MFA inline integration", () => {
  let mockNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockNavigate = vi.fn();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      navigate: mockNavigate,
      currentView: "login",
      viewParam: null,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      userRole: "guest",
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
      articles: [],
      writers: [],
      series: [],
      favorites: [],
      followings: [],
      toggleFavorite: vi.fn(),
      toggleFollow: vi.fn(),
      showToast: vi.fn(),
      fontSize: "md",
      setFontSize: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders credential inputs by default", () => {
    const { container, unmount } = renderWithRouter(<LoginView />);

    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
    expect(container.textContent).toContain("ログイン");

    unmount();
  });

  it("directly navigates to home when user does not have 2FA enabled", async () => {
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" }, session: {} } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [] },
      error: null,
    });

    const { container, unmount } = renderWithRouter(<LoginView />);

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    setNativeValue(emailInput, "test@example.com");
    setNativeValue(passwordInput, "password123");

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "password123",
    });
    expect(mockNavigate).toHaveBeenCalledWith("home");

    unmount();
  });

  it("switches to MFA step and blocks home navigation when 2FA is required", async () => {
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" }, session: {} } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: {
        all: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
        totp: [{ id: "factor-1", status: "verified" }],
      } as any,
      error: null,
    });

    const { container, unmount } = renderWithRouter(<LoginView />);

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    const form = container.querySelector("form") as HTMLFormElement;

    setNativeValue(emailInput, "test@example.com");
    setNativeValue(passwordInput, "password123");

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // 2FAが要求されているため、navigate("home") は呼ばれてはならない
    expect(mockNavigate).not.toHaveBeenCalledWith("home");
    // 画面が2段階認証画面に切り替わっていること
    expect(container.textContent).toContain("2段階認証の確認");
    expect(container.querySelector('input[placeholder="123456"]')).not.toBeNull();

    unmount();
  });

  it("successfully navigates to home after entering 6-digit TOTP code", async () => {
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" }, session: {} } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: {
        all: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
        totp: [{ id: "factor-1", status: "verified" }],
      } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "challenge").mockResolvedValue({
      data: { id: "chal-1", expires_at: 123456789, factor_type: "totp" } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "verify").mockResolvedValue({
      data: { user: {} as any, session: {} as any } as any,
      error: null,
    });

    const { container, unmount } = renderWithRouter(<LoginView />);

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
    let form = container.querySelector("form") as HTMLFormElement;

    setNativeValue(emailInput, "test@example.com");
    setNativeValue(passwordInput, "password123");

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // TOTPコード入力
    const totpInput = container.querySelector('input[placeholder="123456"]') as HTMLInputElement;
    expect(totpInput).not.toBeNull();
    setNativeValue(totpInput, "123456");

    form = container.querySelector("form") as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(supabase.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: "factor-1" });
    expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: "factor-1",
      challengeId: "chal-1",
      code: "123456",
    });
    const appCtx = AppContextModule.useApp();
    expect(appCtx.setMfaChallengeRequired).toHaveBeenCalledWith(false);
    expect(appCtx.refreshProfile).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("home");

    unmount();
  });

  it("allows switching to backup code and navigates to home after verification", async () => {
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" }, session: {} } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: {
        all: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
        totp: [{ id: "factor-1", status: "verified" }],
      } as any,
      error: null,
    });
    vi.spyOn(supabase, "rpc").mockResolvedValue({
      data: true,
      error: null,
    } as any);
    vi.spyOn(supabase.auth, "refreshSession").mockResolvedValue({ data: {} as any, error: null });

    const { container, unmount } = renderWithRouter(<LoginView />);

    setNativeValue(container.querySelector('input[type="email"]')!, "test@example.com");
    setNativeValue(container.querySelector('input[type="password"]')!, "password123");

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    // バックアップコード切り替えボタンをクリック
    const backupSwitchBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("バックアップコード"),
    );
    expect(backupSwitchBtn).not.toBeUndefined();

    await act(async () => {
      backupSwitchBtn!.click();
    });

    expect(container.textContent).toContain("バックアップコードでログイン");

    // バックアップコードを入力
    const backupInput = container.querySelector(
      'input[placeholder="例: abcd-1234"]',
    ) as HTMLInputElement;
    expect(backupInput).not.toBeNull();
    setNativeValue(backupInput, "abcd-1234");

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(supabase.rpc).toHaveBeenCalledWith("verify_and_consume_backup_code", {
      p_code: "abcd-1234",
    });
    expect(mockNavigate).toHaveBeenCalledWith("home");

    unmount();
  });

  it("calls signOut and resets to credentials when canceling from MFA step", async () => {
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" }, session: {} } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: {
        all: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
        totp: [{ id: "factor-1", status: "verified" }],
      } as any,
      error: null,
    });
    vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null });

    const { container, unmount } = renderWithRouter(<LoginView />);

    setNativeValue(container.querySelector('input[type="email"]')!, "test@example.com");
    setNativeValue(container.querySelector('input[type="password"]')!, "password123");

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("2段階認証の確認");

    // 「別のアカウントでログイン」または「ログイン画面に戻る」ボタンをクリック
    const cancelBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("別のアカウントでログイン") || b.textContent?.includes("戻る"),
    );
    expect(cancelBtn).not.toBeUndefined();

    await act(async () => {
      cancelBtn!.click();
    });

    expect(supabase.auth.signOut).toHaveBeenCalled();
    // 認証情報入力画面（メール・パスワード）に戻っていること
    expect(container.querySelector('input[type="email"]')).not.toBeNull();
    expect(container.querySelector('input[type="password"]')).not.toBeNull();

    unmount();
  });

  it("automatically disposes session when unmounted while MFA step is pending (leave-to-lock)", async () => {
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "user-1", email: "test@example.com" }, session: {} } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: {
        all: [{ id: "factor-1", factor_type: "totp", status: "verified" }],
        totp: [{ id: "factor-1", status: "verified" }],
      } as any,
      error: null,
    });
    vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null });

    const { container, unmount } = renderWithRouter(<LoginView />);

    setNativeValue(container.querySelector('input[type="email"]')!, "test@example.com");
    setNativeValue(container.querySelector('input[type="password"]')!, "password123");

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(container.textContent).toContain("2段階認証の確認");

    // 2FA未完了のままURL変更やタブ離脱（コンポーネントがアンマウント）
    unmount();

    // 中途半端なAAL1セッションを放置させないため、signOut が呼ばれていることを検証
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it("works with real AppProviders without mocking useApp (prevents setMfaChallengeRequired is not a function TypeError)", async () => {
    vi.restoreAllMocks();
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as any);
    vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: { user: { id: "user-real", email: "real@example.com" }, session: {} } as any,
      error: null,
    });
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [] },
      error: null,
    });

    const { AppProviders } = await import("../../context/AppContext");
    const { container, unmount } = renderWithRouter(
      <AppProviders>
        <LoginView />
      </AppProviders>,
      { route: "/login" },
    );

    setNativeValue(container.querySelector('input[type="email"]')!, "real@example.com");
    setNativeValue(container.querySelector('input[type="password"]')!, "password123");

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "real@example.com",
      password: "password123",
    });

    unmount();
  });
});
