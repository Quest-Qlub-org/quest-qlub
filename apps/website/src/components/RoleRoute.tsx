import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AccessDeniedView } from "../views/dashboard/AccessDeniedView";
import { SudoConfirmModal } from "./SudoConfirmModal";

// メモリ内プライベートステート（ブラウザコンソールやDevToolsからの改ざんを完全防止）
let inMemorySudoAuthorized = false;
let lastSudoAuthorizedAt = 0;
let sudoMfaHandshakeUntil = 0;

export const SUDO_TIMEOUT_MS = 15 * 60 * 1000; // 15分
const SUDO_MFA_HANDSHAKE_GRACE_MS = 3 * 60 * 1000; // Sudoパスワード検証直後の2FA入力猶予（3分）

export function checkIsSudoActive(): boolean {
  if (!inMemorySudoAuthorized) return false;
  return Date.now() - lastSudoAuthorizedAt < SUDO_TIMEOUT_MS;
}

export function setInMemorySudoAuthorized(active: boolean, isMfaHandshake = false): void {
  inMemorySudoAuthorized = active;
  lastSudoAuthorizedAt = active ? Date.now() : 0;
  sudoMfaHandshakeUntil = active && isMfaHandshake ? Date.now() + SUDO_MFA_HANDSHAKE_GRACE_MS : 0;
}

interface RoleRouteProps {
  requiredRole: "writer" | "editor" | "authenticated";
  children: React.ReactElement;
}

export function RoleRoute({ requiredRole, children }: RoleRouteProps) {
  const navigate = useNavigate();
  const { user, userRole, authLoading, mfaChallengeRequired } = useAuth();
  const isSudoRequired = requiredRole === "writer" || requiredRole === "editor";
  const [sudoPassed, setSudoPassed] = useState<boolean>(
    () => !isSudoRequired || checkIsSudoActive(),
  );
  const mfaPendingRef = React.useRef(mfaChallengeRequired);
  mfaPendingRef.current = mfaChallengeRequired;

  // Leave-to-Lock: 管理画面から一般画面等へ離脱（アンマウント）した際、即座にSudo権限を失効させる
  // ただし、Sudo再認証に伴う一時的な2FAチャレンジ（mfaChallengeRequired または MFAハンドシェイク猶予中）によるアンマウント時は失効させない
  useEffect(() => {
    return () => {
      const isHandshakeActive = Date.now() < sudoMfaHandshakeUntil;
      if (isSudoRequired && !mfaPendingRef.current && !isHandshakeActive) {
        setInMemorySudoAuthorized(false);
      }
    };
  }, [isSudoRequired]);

  useEffect(() => {
    if (isSudoRequired) {
      setSudoPassed(checkIsSudoActive());
    }
  }, [isSudoRequired, mfaChallengeRequired]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (requiredRole === "editor") {
    if (userRole !== "editor") {
      return <AccessDeniedView requiredRole="editor" />;
    }
  } else if (requiredRole === "writer") {
    if (userRole !== "writer" && userRole !== "editor") {
      return <AccessDeniedView requiredRole="writer" />;
    }
  } else if (requiredRole === "authenticated") {
    if (userRole === "guest") {
      return <AccessDeniedView requiredRole="authenticated" />;
    }
  }

  // 管理者・ライター専用エリアの Sudo Mode（再認証 + 2FA一気通貫）チェック
  if (isSudoRequired && !sudoPassed) {
    // すでに初期ログイン時のMFA自体が未完了でSudoも未通過の場合はアクセス拒否
    if (mfaChallengeRequired && !user) {
      return <AccessDeniedView requiredRole="authenticated" />;
    }
    return (
      <SudoConfirmModal
        userEmail={user?.email || ""}
        onSuccess={() => {
          setInMemorySudoAuthorized(true);
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

  return children;
}
