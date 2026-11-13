// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { supabase } from "../supabase";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AuthContext security & MFA", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
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
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it("prevents privilege escalation: user_metadata.role='editor' does not grant editor role on fallback", async () => {
    // 悪意のあるユーザーが user_metadata.role に editor を注入
    const maliciousUser = {
      id: "malicious-user-1",
      email: "attacker@example.com",
      user_metadata: {
        role: "editor",
        display_name: "Attacker",
      },
    };

    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: maliciousUser as any,
          access_token: "token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 1800000000,
          refresh_token: "ref",
        },
      },
      error: null,
    });

    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
          id: "sub-1",
          callback: vi.fn(),
        },
      },
    });

    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [] },
      error: null,
    });

    // DB取得は遅延または失敗させることでフォールバック状態を検証
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("DB connection lag"),
        }),
      }),
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: mockSelect,
    } as any);

    let authState!: ReturnType<typeof useAuth>;
    const TestConsumer = () => {
      authState = useAuth();
      return <div>Role: {authState.userRole}</div>;
    };

    await act(async () => {
      root!.render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>,
      );
    });

    // クライアントの user_metadata.role が 'editor' であっても、
    // フォールバックは厳格に 'viewer' に制限され、特権昇格が防がれていることを検証
    expect(authState.userRole).toBe("viewer");
    expect(authState.profile?.role).toBe("viewer");
  });

  it("sets mfaChallengeRequired to true when user has registered TOTP and is at AAL1", async () => {
    const user = {
      id: "mfa-user-1",
      email: "user@example.com",
      user_metadata: {},
    };

    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: user as any,
          access_token: "token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 1800000000,
          refresh_token: "ref",
        },
      },
      error: null,
    });

    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
          id: "sub-2",
          callback: vi.fn(),
        },
      },
    });

    // AAL1 でログイン中だが、MFAが有効（nextLevel === 'aal2'）
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: user.id,
            role: "editor",
            display_name: "Editor User",
            username: "editor_user",
            avatar_url: null,
            bio: null,
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      }),
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: mockSelect,
    } as any);

    let authState!: ReturnType<typeof useAuth>;
    const TestConsumer = () => {
      authState = useAuth();
      return <div>MFA Required: {String(authState.mfaChallengeRequired)}</div>;
    };

    await act(async () => {
      root!.render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>,
      );
    });

    // MFAチャレンジが必要と正しく判定される
    expect(authState.mfaChallengeRequired).toBe(true);
  });

  it("sets mfaChallengeRequired to false when session is already at AAL2", async () => {
    const user = {
      id: "mfa-user-2",
      email: "verified@example.com",
      user_metadata: {},
    };

    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: user as any,
          access_token: "token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 1800000000,
          refresh_token: "ref",
        },
      },
      error: null,
    });

    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
          id: "sub-3",
          callback: vi.fn(),
        },
      },
    });

    // 既に AAL2 検証済み
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            id: user.id,
            role: "writer",
            display_name: "Writer User",
            username: "writer_user",
            avatar_url: null,
            bio: null,
            created_at: new Date().toISOString(),
          },
          error: null,
        }),
      }),
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      select: mockSelect,
    } as any);

    let authState!: ReturnType<typeof useAuth>;
    const TestConsumer = () => {
      authState = useAuth();
      return <div>MFA Required: {String(authState.mfaChallengeRequired)}</div>;
    };

    await act(async () => {
      root!.render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>,
      );
    });

    expect(authState.mfaChallengeRequired).toBe(false);
  });

  it("clears user-scoped localStorage and sessionStorage keys on SIGNED_OUT", async () => {
    let authCallback: ((event: string, session: unknown) => void) | null = null;
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((cb: any) => {
      authCallback = cb;
      return {
        data: {
          subscription: { unsubscribe: vi.fn(), id: "sub-out", callback: vi.fn() },
        },
      };
    });

    localStorage.setItem("quest_qlub_comments_art1", "[]");
    localStorage.setItem("quest_qlub_follows_u1", "[]");
    localStorage.setItem("quest_qlub_scheduled_articles_v1", "{}");
    localStorage.setItem("preferred_theme", "dark");
    sessionStorage.setItem("quest_qlub_sudo_at", "12345");

    await act(async () => {
      root!.render(
        <AuthProvider>
          <div>child</div>
        </AuthProvider>,
      );
    });

    act(() => {
      authCallback?.("SIGNED_OUT", null);
    });

    expect(localStorage.getItem("quest_qlub_comments_art1")).toBeNull();
    expect(localStorage.getItem("quest_qlub_follows_u1")).toBeNull();
    expect(localStorage.getItem("quest_qlub_scheduled_articles_v1")).toBeNull();
    expect(sessionStorage.getItem("quest_qlub_sudo_at")).toBeNull();
    expect(localStorage.getItem("preferred_theme")).toBe("dark");
  });
});
