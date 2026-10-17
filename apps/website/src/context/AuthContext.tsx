import React, { createContext, useContext, useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type { Profile } from "../supabase";

export type UserRole = "guest" | "viewer" | "writer" | "editor";

export interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  userRole: UserRole;
  setUserRole: React.Dispatch<React.SetStateAction<UserRole>>;
  authLoading: boolean;
  mfaChallengeRequired: boolean;
  setMfaChallengeRequired: React.Dispatch<React.SetStateAction<boolean>>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("guest");
  const [authLoading, setAuthLoading] = useState(true);
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState(false);

  const fetchProfileData = async (
    userId: string,
    email?: string,
    userMetadata?: Record<string, unknown>,
  ): Promise<{ profile: Profile; role: UserRole }> => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, display_name, username, x_account, avatar_url, bio, created_at")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data) {
        return {
          profile: {
            ...data,
            email: email || user?.email || "",
          },
          role: (data.role as UserRole) || "viewer",
        };
      }
    } catch (e) {
      console.warn("Failed to fetch profile from DB, using fallback", e);
    }

    // DB取得失敗またはレコード未作成時の安全なフォールバック
    const fallbackProfile: Profile = {
      id: userId,
      email: email || user?.email || "",
      role: "viewer",
      display_name:
        (userMetadata?.display_name as string) ||
        (userMetadata?.name as string) ||
        (userMetadata?.full_name as string) ||
        email?.split("@")[0] ||
        "ユーザー",
      username: (userMetadata?.username as string) || email?.split("@")[0] || "user",
      avatar_url: (userMetadata?.avatar_url as string) || null,
      bio: null,
    };
    return { profile: fallbackProfile, role: "viewer" };
  };

  const refreshProfile = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data) {
        setMfaChallengeRequired(data.currentLevel === "aal1" && data.nextLevel === "aal2");
      }
    } catch {
      // ignore
    }
    const { profile: updatedProfile, role } = await fetchProfileData(
      user.id,
      user.email,
      user.user_metadata,
    );
    setProfile(updatedProfile);
    setUserRole(role);
  };

  // 1. 初回セッション復元 & 認証イベントリスナー（デッドロック完全防止）
  useEffect(() => {
    let isMounted = true;

    const checkMfaAssurance = async () => {
      try {
        const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!error && data) {
          if (data.currentLevel === "aal1" && data.nextLevel === "aal2") {
            if (isMounted) setMfaChallengeRequired(true);
            return;
          }
        }
      } catch (err) {
        console.warn("Failed to check MFA assurance level", err);
      }
      if (isMounted) setMfaChallengeRequired(false);
    };

    // getSession によるセッション初期復元
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        if (session?.user) {
          setUser(session.user);
          void checkMfaAssurance();
        } else {
          setUser(null);
          setProfile(null);
          setUserRole("guest");
          setMfaChallengeRequired(false);
        }
      })
      .catch((e) => {
        console.error("Auth getSession error", e);
      })
      .finally(() => {
        if (isMounted) {
          setAuthLoading(false);
        }
      });

    // onAuthStateChange（Supabase内部ロック解放のためコールバック内では同期処理のみ実行）
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === "SIGNED_OUT" || !session?.user) {
        setUser(null);
        setProfile(null);
        setUserRole("guest");
        setMfaChallengeRequired(false);
        setAuthLoading(false);
        return;
      }

      setUser(session.user);
      setAuthLoading(false);
      void checkMfaAssurance();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // 2. ユーザー確定時のプロファイル取得（Reactライフサイクル内で独立して安全に非同期実行）
  useEffect(() => {
    let isMounted = true;

    if (!user?.id) {
      setProfile(null);
      setUserRole("guest");
      return;
    }

    // 初回フォールバック設定（画面のチラつきや未ログイン誤判定を防止）
    // ⚠️ セキュリティ対策: クライアントから改ざん可能な user_metadata.role は絶対に信用せず、
    // DB（profiles テーブル）から正式取得できるまで常に安全な "viewer" とする。
    const meta = user.user_metadata || {};
    const fallbackRole: Profile["role"] = "viewer";
    const initialFallback: Profile = {
      id: user.id,
      email: user.email || "",
      role: fallbackRole,
      display_name:
        (meta.display_name as string) ||
        (meta.name as string) ||
        (meta.full_name as string) ||
        user.email?.split("@")[0] ||
        "ユーザー",
      username: (meta.username as string) || user.email?.split("@")[0] || "user",
      avatar_url: (meta.avatar_url as string) || null,
      bio: null,
    };

    setProfile((prev) => (prev?.id === user.id ? prev : initialFallback));
    setUserRole((prev) => (prev !== "guest" ? prev : fallbackRole));

    // DBから最新プロファイルと正式ロールを取得
    const loadProfile = async () => {
      const { profile: latestProfile, role: latestRole } = await fetchProfileData(
        user.id,
        user.email,
        user.user_metadata,
      );
      if (isMounted) {
        setProfile(latestProfile);
        setUserRole(latestRole);
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.email]);

  const value: AuthContextType = {
    user,
    profile,
    setProfile,
    userRole,
    setUserRole,
    authLoading,
    mfaChallengeRequired,
    setMfaChallengeRequired,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
