import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { ShieldAlert, ShieldCheck, AlertCircle, Key, ArrowLeft } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useAuth } from "../context/AuthContext";
import {
  beginSudoMfaHandshake,
  confirmServerSudoSession,
  lockSudoSession,
} from "../utils/sudoState";
import { findVerifiedTotpFactor, verifyTotpCode } from "../utils/mfa";

interface SudoConfirmModalProps {
  userEmail: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const SudoConfirmModal: React.FC<SudoConfirmModalProps> = ({
  userEmail,
  onSuccess,
  onCancel,
}) => {
  const { user, setMfaChallengeRequired } = useAuth();
  const [step, setStep] = useState<"password" | "mfa_totp">("password");
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !!window.PublicKeyCredential) {
      setIsPasskeySupported(true);
    }
  }, []);

  const resetWithError = (message: string) => {
    lockSudoSession();
    setStep("password");
    setError(message);
  };

  const handleCancel = () => {
    lockSudoSession();
    onCancel();
  };

  const modalRef = useFocusTrap<HTMLDivElement>(true, handleCancel);

  const confirmAuthorization = async () => {
    if (!isMountedRef.current) return;

    const authorized = await confirmServerSudoSession();
    if (!isMountedRef.current) {
      if (authorized) lockSudoSession();
      return;
    }

    setMfaChallengeRequired(false);
    if (authorized) {
      onSuccess();
    } else {
      resetWithError("管理操作の再認証を確認できませんでした。もう一度お試しください。");
    }
  };

  const continueAfterPrimaryAuth = async () => {
    const { data: mfaLevel, error: mfaError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!isMountedRef.current) return;
    if (mfaError || !mfaLevel) {
      resetWithError("2段階認証状態の確認に失敗しました");
      return;
    }
    if (mfaLevel.currentLevel === "aal1" && mfaLevel.nextLevel === "aal2") {
      const factor = await findVerifiedTotpFactor();
      if (!isMountedRef.current) return;
      if (!factor.factorId) {
        resetWithError("2段階認証の確認が必要です");
        return;
      }
      setFactorId(factor.factorId);
      setVerifyCode("");
      setStep("mfa_totp");
      return;
    }

    await confirmAuthorization();
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError("");
    try {
      const started = await beginSudoMfaHandshake();
      if (!isMountedRef.current) return;
      if (!started) {
        resetWithError("管理操作の再認証を開始できませんでした。もう一度お試しください。");
        return;
      }
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });
      if (signInError || !data.session) {
        resetWithError("パスワードが正しくありません");
        return;
      }

      setPassword("");
      await continueAfterPrimaryAuth();
    } catch {
      resetWithError("認証処理中にエラーが発生しました");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim() || !factorId || loading) return;

    setLoading(true);
    setError("");
    try {
      const result = await verifyTotpCode(factorId, verifyCode);
      if (!result.success) {
        setError(result.errorMessage ?? "2段階認証に失敗しました");
        return;
      }
      await confirmAuthorization();
    } catch {
      resetWithError("2段階認証の処理中にエラーが発生しました");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handlePasskeySubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const started = await beginSudoMfaHandshake();
      if (!isMountedRef.current) return;
      if (!started) {
        resetWithError("管理操作の再認証を開始できませんでした。もう一度お試しください。");
        return;
      }
      const { data, error: passkeyError } = await supabase.auth.signInWithPasskey();
      if (passkeyError || !data.session) {
        resetWithError(
          passkeyError?.name === "NotAllowedError" ? "" : "パスキーでの認証に失敗しました",
        );
        return;
      }

      if (data.session.user.id !== user?.id) {
        await supabase.auth.signOut({ scope: "local" });
        resetWithError("現在のログインアカウントと異なるパスキーが使用されました");
        return;
      }

      await continueAfterPrimaryAuth();
    } catch {
      resetWithError("パスキー認証中にエラーが発生しました");
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sudo-confirm-title"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm overflow-hidden p-6 text-center"
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            step === "mfa_totp"
              ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400"
              : "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400"
          }`}
        >
          {step === "mfa_totp" ? (
            <ShieldCheck className="w-6 h-6" />
          ) : (
            <ShieldAlert className="w-6 h-6" />
          )}
        </div>

        <h2
          id="sudo-confirm-title"
          className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1"
        >
          {step === "mfa_totp" ? "2段階認証の確認" : "管理者権限の確認"}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
          {step === "mfa_totp"
            ? "引き続いて、認証アプリに表示されている6桁のコードを入力してください。"
            : "ダッシュボードへのアクセスには、セキュリティ保護のためアカウントの再確認が必要です。パスワードを入力してください。"}
        </p>

        {error && (
          <div
            id="sudo-confirm-error"
            role="alert"
            className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 mb-4 text-left"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === "mfa_totp" ? (
          <form onSubmit={(e) => void handleVerifyTotp(e)} className="space-y-4">
            <div>
              <label htmlFor="sudo-confirm-totp-input" className="sr-only">
                6桁の認証コード
              </label>
              <input
                id="sudo-confirm-totp-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                autoFocus
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "sudo-confirm-error" : undefined}
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center tracking-[0.4em] font-mono text-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || verifyCode.length !== 6 || !factorId}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {loading ? "認証中..." : "認証して進む"}
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="sudo-confirm-password-input" className="sr-only">
                  現在のパスワード
                </label>
                <input
                  id="sudo-confirm-password-input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="現在のパスワード"
                  autoFocus
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "sudo-confirm-error" : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 bg-gray-900 dark:bg-gray-700 text-white font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
              >
                {loading ? "認証中..." : "認証して進む"}
              </button>
            </form>

            {isPasskeySupported && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={handlePasskeySubmit}
                  disabled={loading}
                  className="w-full py-2.5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-750 flex items-center justify-center gap-2 bg-white dark:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Key className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  パスキーで再認証
                </button>
              </div>
            )}
          </>
        )}

        <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>キャンセルして戻る</span>
          </button>
        </div>
      </div>
    </div>
  );
};
