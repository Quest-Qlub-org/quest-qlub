/* eslint-disable @typescript-eslint/unbound-method */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { BrowserRouter } from "react-router-dom";
import { RoleRoute, setInMemorySudoAuthorized } from "./RoleRoute";
import { UIProvider } from "../context/UIContext";
import { DataProvider } from "../context/DataContext";
import * as AuthContextModule from "../context/AuthContext";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("RoleRoute access control", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    setInMemorySudoAuthorized(false);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  function renderWithRouter(ui: React.ReactElement) {
    act(() => {
      root!.render(
        <BrowserRouter>
          <UIProvider>
            <DataProvider>{ui}</DataProvider>
          </UIProvider>
        </BrowserRouter>,
      );
    });
  }

  it("renders spinner when auth is loading", () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "guest",
      authLoading: true,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    renderWithRouter(
      <RoleRoute requiredRole="editor">
        <div>保護されたコンテンツ</div>
      </RoleRoute>,
    );

    expect(container.textContent).not.toContain("保護されたコンテンツ");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("blocks guest user from authenticated role and shows AccessDeniedView", () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "guest",
      authLoading: false,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    renderWithRouter(
      <RoleRoute requiredRole="authenticated">
        <div>認証済み専用</div>
      </RoleRoute>,
    );

    expect(container.textContent).not.toContain("認証済み専用");
    expect(container.textContent).toContain("アクセス権限がありません");
  });

  it("allows writer and editor to access writer route", () => {
    setInMemorySudoAuthorized(true);

    // 1. Writer access
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "writer",
      authLoading: false,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    renderWithRouter(
      <RoleRoute requiredRole="writer">
        <div>ライターダッシュボード</div>
      </RoleRoute>,
    );

    expect(container.textContent).toContain("ライターダッシュボード");

    // 2. Editor access
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "editor",
      authLoading: false,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    renderWithRouter(
      <RoleRoute requiredRole="writer">
        <div>ライターダッシュボード</div>
      </RoleRoute>,
    );

    expect(container.textContent).toContain("ライターダッシュボード");
  });

  it("blocks writer from editor route", () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "writer",
      authLoading: false,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    renderWithRouter(
      <RoleRoute requiredRole="editor">
        <div>編集長ダッシュボード</div>
      </RoleRoute>,
    );

    expect(container.textContent).not.toContain("編集長ダッシュボード");
    expect(container.textContent).toContain("アクセス権限がありません");
  });

  it("allows editor to access editor route", () => {
    setInMemorySudoAuthorized(true);

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "editor",
      authLoading: false,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    renderWithRouter(
      <RoleRoute requiredRole="editor">
        <div>編集長ダッシュボード</div>
      </RoleRoute>,
    );

    expect(container.textContent).toContain("編集長ダッシュボード");
  });

  it("blocks access to protected route when mfaChallengeRequired is true even for editor", () => {
    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      userRole: "editor",
      authLoading: false,
      user: null,
      profile: null,
      setProfile: vi.fn(),
      setUserRole: vi.fn(),
      mfaChallengeRequired: true,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    renderWithRouter(
      <RoleRoute requiredRole="editor">
        <div>編集長ダッシュボード</div>
      </RoleRoute>,
    );

    expect(container.textContent).not.toContain("編集長ダッシュボード");
    expect(container.textContent).toContain("アクセス権限がありません");
  });

  describe("Sudo Mode (Step-up Authentication) for writer & editor", () => {
    beforeEach(() => {
      sessionStorage.clear();
    });

    it("prompts for sudo authentication when writer accesses dashboard without active sudo session", () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "writer",
        authLoading: false,
        user: { id: "user-w", email: "writer@example.com" } as any,
        profile: null,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: vi.fn(),
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="writer">
          <div>保護されたライター画面</div>
        </RoleRoute>,
      );

      // Sudo未認証のためダッシュボード本体は表示されず、再認証モーダルが表示される
      expect(container.textContent).not.toContain("保護されたライター画面");
      expect(container.textContent).toContain("管理者権限の確認");
      expect(container.querySelector('input[type="password"]')).not.toBeNull();
    });

    it("allows access to dashboard after entering correct password in sudo modal", async () => {
      const { supabase } = await import("../supabase");
      vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
        data: { user: { id: "user-w" }, session: {} } as any,
        error: null,
      });

      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "writer",
        authLoading: false,
        user: { id: "user-w", email: "writer@example.com" } as any,
        profile: null,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: vi.fn(),
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="writer">
          <div>保護されたライター画面</div>
        </RoleRoute>,
      );

      expect(container.textContent).toContain("管理者権限の確認");

      const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
      const sudoForm = container.querySelector("form") as HTMLFormElement;

      // test-utils の setNativeValue
      const { setNativeValue } = await import("../test/test-utils");
      setNativeValue(passwordInput, "correct-password");

      await act(async () => {
        sudoForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "writer@example.com",
        password: "correct-password",
      });

      // 認証成功によりダッシュボードが表示される
      expect(container.textContent).toContain("保護されたライター画面");
      expect(container.textContent).not.toContain("管理者権限の確認");
    });

    it("rejects access and demands sudo re-auth even if sessionStorage is maliciously injected (anti-tamper)", () => {
      // 攻撃者がブラウザのデベロッパーツールで sessionStorage を改ざんしたシナリオ
      sessionStorage.setItem("quest_qlub_sudo_at", Date.now().toString());

      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "editor",
        authLoading: false,
        user: { id: "user-e", email: "editor@example.com" } as any,
        profile: null,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: vi.fn(),
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="editor">
          <div id="editor-secret">編集長専用極秘データ</div>
        </RoleRoute>,
      );

      // sessionStorage の偽造では突破できず、管理者確認が要求され、極秘データはDOMに存在しないこと
      expect(container.textContent).toContain("管理者権限の確認");
      expect(container.querySelector("#editor-secret")).toBeNull();
      expect(container.textContent).not.toContain("編集長専用極秘データ");
    });

    it("automatically revokes sudo authorization when user navigates away from admin area (leave-to-lock)", async () => {
      const { supabase } = await import("../supabase");
      vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
        data: { user: { id: "user-w" }, session: {} } as any,
        error: null,
      });

      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "writer",
        authLoading: false,
        user: { id: "user-w", email: "writer@example.com" } as any,
        profile: null,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: vi.fn(),
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="writer">
          <div id="writer-dash">ライターダッシュボード本体</div>
        </RoleRoute>,
      );

      expect(container.textContent).toContain("管理者権限の確認");

      // 1. パスワード入力して認証成功
      const { setNativeValue } = await import("../test/test-utils");
      setNativeValue(container.querySelector('input[type="password"]')!, "valid-password");

      await act(async () => {
        container
          .querySelector("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(container.textContent).toContain("ライターダッシュボード本体");

      // 2. 一般ページへ移動（アンマウント）
      act(() => {
        root!.unmount();
        root = createRoot(container);
      });

      // 3. 再び管理画面へアクセス（再マウント）
      renderWithRouter(
        <RoleRoute requiredRole="writer">
          <div id="writer-dash">ライターダッシュボード本体</div>
        </RoleRoute>,
      );

      // Leave-to-Lock により、離脱時に Sudo 権限が即座に失効しているため、再度認証が求められること！
      expect(container.textContent).toContain("管理者権限の確認");
      expect(container.querySelector("#writer-dash")).toBeNull();
    });

    it("navigates to home when user cancels sudo confirmation modal", async () => {
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "writer",
        authLoading: false,
        user: { id: "user-w", email: "writer@example.com" } as any,
        profile: null,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: vi.fn(),
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="writer">
          <div>保護されたライター画面</div>
        </RoleRoute>,
      );

      const cancelBtn = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent?.includes("キャンセル") || b.textContent?.includes("戻る"),
      );
      expect(cancelBtn).not.toBeUndefined();

      await act(async () => {
        cancelBtn!.click();
      });

      expect(container.textContent).not.toContain("保護されたライター画面");
    });

    it("completes Sudo + inline 2FA without looping back to password modal when 2FA is enabled on admin account", async () => {
      const { supabase } = await import("../supabase");
      const mockSetMfaChallengeRequired = vi.fn();

      // パスワード再認証時、Supabase Auth は一時的にセッションを aal1 (nextLevel: aal2) にダウングレードする
      vi.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
        data: { user: { id: "user-e" }, session: {} } as any,
        error: null,
      });
      vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
        data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
        error: null,
      });
      vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
        data: {
          all: [{ id: "factor-admin", factor_type: "totp", status: "verified" }],
          totp: [{ id: "factor-admin", status: "verified" }],
        } as any,
        error: null,
      });
      vi.spyOn(supabase.auth.mfa, "challenge").mockResolvedValue({
        data: { id: "chal-admin", expires_at: 999999, factor_type: "totp" } as any,
        error: null,
      });
      vi.spyOn(supabase.auth.mfa, "verify").mockResolvedValue({
        data: { user: { id: "user-e" }, session: {} } as any,
        error: null,
      });

      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "editor",
        authLoading: false,
        user: { id: "user-e", email: "editor@example.com" } as any,
        profile: null,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: mockSetMfaChallengeRequired,
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="editor">
          <div id="editor-dashboard">編集長ダッシュボード本体</div>
        </RoleRoute>,
      );

      // Step 1: パスワード入力画面が表示されている
      expect(container.textContent).toContain("管理者権限の確認");
      const { setNativeValue } = await import("../test/test-utils");
      const passwordInput = container.querySelector('input[type="password"]') as HTMLInputElement;
      setNativeValue(passwordInput, "admin-password");

      await act(async () => {
        container
          .querySelector("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      // Step 2: 2FAが有効なため、まだダッシュボードは表示されず、Sudoモーダル内で2FAコード入力に切り替わること
      expect(container.querySelector("#editor-dashboard")).toBeNull();
      const totpInput = container.querySelector('input[placeholder="123456"]') as HTMLInputElement;
      expect(totpInput).not.toBeNull();

      // 6桁のTOTPコードを入力して送信
      setNativeValue(totpInput, "654321");
      await act(async () => {
        container
          .querySelector("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      expect(supabase.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: "factor-admin" });
      expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({
        factorId: "factor-admin",
        challengeId: "chal-admin",
        code: "654321",
      });
      expect(mockSetMfaChallengeRequired).toHaveBeenCalledWith(false);

      // Step 3: パスワードモーダルにループせず、編集長ダッシュボード本体が表示されること！
      expect(container.querySelector("#editor-dashboard")).not.toBeNull();
      expect(container.textContent).toContain("編集長ダッシュボード本体");
    });

    it("preserves Sudo authorization even if RoleRoute is temporarily unmounted by AppLayout MfaChallengeModal right after password verification", async () => {
      const { supabase } = await import("../supabase");

      // 実機で signInWithPassword が SIGNED_IN イベントを発火し、AppLayout が RoleRoute を一時アンマウントする挙動を再現
      vi.spyOn(supabase.auth, "signInWithPassword").mockImplementation(async () => {
        return {
          data: { user: { id: "user-e" }, session: {} } as any,
          error: null,
        };
      });
      vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
        data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
        error: null,
      });
      vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
        data: {
          all: [{ id: "factor-admin", factor_type: "totp", status: "verified" }],
          totp: [{ id: "factor-admin", status: "verified" }],
        } as any,
        error: null,
      });

      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "editor",
        authLoading: false,
        user: { id: "user-e", email: "editor@example.com" } as any,
        profile: null,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: vi.fn(),
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="editor">
          <div id="editor-dashboard">編集長ダッシュボード本体</div>
        </RoleRoute>,
      );

      const { setNativeValue } = await import("../test/test-utils");
      setNativeValue(container.querySelector('input[type="password"]')!, "admin-password");

      await act(async () => {
        container
          .querySelector("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });

      // AppLayout の MfaChallengeModal 表示により RoleRoute が一時アンマウントされた状況をシミュレート
      act(() => {
        root!.unmount();
        root = createRoot(container);
      });

      // MfaChallengeModal で2FAが完了し、再び RoleRoute がマウントされた際、
      // パスワード再入力モーダルにループせず直接ダッシュボードが表示されること！
      renderWithRouter(
        <RoleRoute requiredRole="editor">
          <div id="editor-dashboard">編集長ダッシュボード本体</div>
        </RoleRoute>,
      );

      expect(container.querySelector("#editor-dashboard")).not.toBeNull();
      expect(container.textContent).toContain("編集長ダッシュボード本体");
    });

    it("allows access to writer role when profile has writer in roles array even if userRole is viewer", () => {
      setInMemorySudoAuthorized(true);
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "viewer",
        authLoading: false,
        user: { id: "user-eng-writer", email: "eng-writer@example.com" } as any,
        profile: {
          id: "user-eng-writer",
          role: "viewer",
          roles: ["engineer", "writer"],
          email: "eng-writer@example.com",
          display_name: "エンジニア兼ライター",
        } as any,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: vi.fn(),
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="writer">
          <div id="writer-content">執筆画面</div>
        </RoleRoute>,
      );

      expect(container.querySelector("#writer-content")).not.toBeNull();
      expect(container.textContent).toContain("執筆画面");
    });

    it("allows access to editor role when profile has editor in roles array even if userRole is engineer", () => {
      setInMemorySudoAuthorized(true);
      vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
        userRole: "engineer" as any,
        authLoading: false,
        user: { id: "user-eng-editor", email: "eng-editor@example.com" } as any,
        profile: {
          id: "user-eng-editor",
          role: "viewer",
          roles: ["engineer", "editor"],
          email: "eng-editor@example.com",
          display_name: "エンジニア兼編集長",
        } as any,
        setProfile: vi.fn(),
        setUserRole: vi.fn(),
        mfaChallengeRequired: false,
        setMfaChallengeRequired: vi.fn(),
        refreshProfile: vi.fn(),
      });

      renderWithRouter(
        <RoleRoute requiredRole="editor">
          <div id="editor-content">編集長画面</div>
        </RoleRoute>,
      );

      expect(container.querySelector("#editor-content")).not.toBeNull();
      expect(container.textContent).toContain("編集長画面");
    });
  });
});
