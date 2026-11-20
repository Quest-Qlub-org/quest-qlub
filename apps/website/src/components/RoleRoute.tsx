import React, { useState, useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AccessDeniedView } from "../views/dashboard/AccessDeniedView";
import { SudoConfirmModal } from "./SudoConfirmModal";
import { profileHasRole } from "../utils/roles";
import {
  SUDO_TIMEOUT_MS,
  checkIsSudoActive,
  setInMemorySudoAuthorized,
  isSudoMfaHandshakeActive,
  getSudoRemainingMs,
  lockSudoSession,
} from "../utils/sudoState";

export { SUDO_TIMEOUT_MS, checkIsSudoActive, setInMemorySudoAuthorized };

interface RoleRouteProps {
  requiredRole: "writer" | "editor" | "authenticated";
  children?: React.ReactElement;
  manageLeaveLock?: boolean;
}

/**
 * 管理エリア全体（/writer-dash/* と /editor-dash/*）を束ねて Sudo Mode の
 * Leave-to-Lock ライフサイクルを単一スコープで管理するラッパーレイアウト。
 */
export function SudoAreaLayout() {
  useEffect(() => {
    return () => {
      if (!isSudoMfaHandshakeActive()) {
        lockSudoSession();
      }
    };
  }, []);

  return <Outlet />;
}

export function RoleRoute({ requiredRole, children, manageLeaveLock = true }: RoleRouteProps) {
  const navigate = useNavigate();
  const { user, profile, userRole, authLoading, mfaChallengeRequired } = useAuth();
  const isEditor =
    userRole === "editor" || profileHasRole(profile, "editor", { ignoreLocalOverrides: true });
  const isWriter =
    userRole === "writer" ||
    profileHasRole(profile, "writer", { ignoreLocalOverrides: true }) ||
    isEditor;
  const isSudoRequired = requiredRole === "writer" || requiredRole === "editor";
  const [sudoPassed, setSudoPassed] = useState<boolean>(
    () => !isSudoRequired || checkIsSudoActive(),
  );
  const mfaPendingRef = React.useRef(mfaChallengeRequired);
  mfaPendingRef.current = mfaChallengeRequired;

  // Leave-to-Lock: 管理画面から一般画面等へ離脱（アンマウント）した際、即座にSudo権限を失効させる
  // ただし、Sudo再認証に伴う一時的な2FAチャレンジ（mfaChallengeRequired または MFAハンドシェイク猶予中）や
  // 外側の SudoAreaLayout に委譲されている場合（manageLeaveLock = false）は失効させない
  useEffect(() => {
    return () => {
      if (!manageLeaveLock) return;
      if (isSudoRequired && !mfaPendingRef.current && !isSudoMfaHandshakeActive()) {
        lockSudoSession();
      }
    };
  }, [isSudoRequired, manageLeaveLock]);

  useEffect(() => {
    if (isSudoRequired) {
      setSudoPassed(checkIsSudoActive());
    }
  }, [isSudoRequired, mfaChallengeRequired]);

  // 15分（SUDO_TIMEOUT_MS）経過による自動ロックタイマー
  useEffect(() => {
    if (!isSudoRequired || !sudoPassed) return;
    const remainingMs = getSudoRemainingMs();
    const timer = window.setTimeout(() => {
      lockSudoSession();
      setSudoPassed(false);
    }, remainingMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isSudoRequired, sudoPassed]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (requiredRole === "editor") {
    if (!isEditor) {
      return <AccessDeniedView requiredRole="editor" />;
    }
  } else if (requiredRole === "writer") {
    if (!isWriter) {
      return <AccessDeniedView requiredRole="writer" />;
    }
  } else if (requiredRole === "authenticated") {
    if (userRole === "guest") {
      return <AccessDeniedView requiredRole="authenticated" />;
    }
  }

  // 管理者・ライター専用エリアの Sudo Mode（再認証 + 2FA一気通貫）チェック
  if (isSudoRequired && !sudoPassed) {
    // すでに初期ログイン時のMFA自体が未完了の場合は、Sudoに進まずアクセス拒否する
    if (mfaChallengeRequired) {
      return <AccessDeniedView requiredRole="authenticated" />;
    }
    return (
      <SudoConfirmModal
        userEmail={user?.email || ""}
        onSuccess={() => {
          setSudoPassed(true);
        }}
        onCancel={() => {
          void navigate("/");
        }}
      />
    );
  }

  // 2段階認証（MFA）が未完了の場合は保護ルートへのアクセスを遮断
  if (mfaChallengeRequired) {
    return <AccessDeniedView requiredRole="authenticated" />;
  }

  return children ?? <Outlet />;
}
