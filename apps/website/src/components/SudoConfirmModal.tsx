import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { ShieldAlert, ShieldCheck, AlertCircle, Key, ArrowLeft } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useAuth } from "../context/AuthContext";
import { setInMemorySudoAuthorized } from "./RoleRoute";

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
  const { setMfaChallengeRequired } = useAuth();
  const [step, setStep] = useState<"password" | "mfa_totp">("password");
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);

  const modalRef = useFocusTrap<HTMLDivElement>(true, () => {
    onCancel();
  });

  useEffect(() => {
    if (typeof window !== "undefined" && !!window.PublicKeyCredential) {
      setIsPasskeySupported(true);
    }
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError("");

    try {
      // signInWithPassword が内部で SIGNED_IN イベントを発火し、2FA有効ユーザーでは一時的に
      // AppLayout の MfaChallengeModal に切り替わる（RoleRoute がアンマウントされる）場合があるため、
      // 呼び出し直前に MFA ハンドシェイク猶予付きでメモリ内 Sudo 認可フラグをセットし、失敗時は即座に取り消す
      setInMemorySudoAuthorized(true, true);

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });

      if (signInErr) {
        setInMemorySudoAuthorized(false);
        setError("パスワードが正しくありません");
        setLoading(false);
        return;
      }

      // 2FA有効ユーザーの場合、signInWithPassword でセッションが aal1 にダウングレードされるため、
      // モーダル内でシームレスに2FA（AAL2）昇格まで完了させる
      try {
        const { data: mfaLevel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (mfaLevel && mfaLevel.currentLevel === "aal1" && mfaLevel.nextLevel === "aal2") {
          const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
          if (!factorsErr && factorsData) {
            const verifiedTotp =
              factorsData.totp.find((f) => f.status === "verified") ?? factorsData.totp[0];
            if (verifiedTotp) {
              setFactorId(verifiedTotp.id);
              setStep("mfa_totp");
              setLoading(false);
              return;
            }
          }
        }
      } catch {
        // ignore MFA check error when not configured
      }

      // 2FA不要ユーザーの場合はハンドシェイク猶予フラグを通常のSudo認可に確定させる
      setInMemorySudoAuthorized(true, false);
      setMfaChallengeRequired(false);
      onSuccess();
    } catch {
      setInMemorySudoAuthorized(false);
      setError("認証処理中にエラーが発生しました");
      setLoading(false);
    }
  };

  const handleVerifyTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim() || !factorId) return;

    setLoading(true);
    setError("");

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        setError(challenge.error.message || "認証チャレンジの作成に失敗しました");
        setLoading(false);
        return;
      }

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode.trim(),
      });

      if (verify.error) {
        setError("認証コードが正しくありません。最新の6桁コードを入力してください。");
        setLoading(false);
        return;
      }

      setInMemorySudoAuthorized(true);
      setMfaChallengeRequired(false);
      onSuccess();
    } catch {
      setError("2段階認証の処理中にエラーが発生しました");
      setLoading(false);
    }
  };

  const handlePasskeySubmit = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: passkeyErr } = await supabase.auth.signInWithPasskey();
      if (passkeyErr) {
        if (passkeyErr.name !== "NotAllowedError") {
          setError("パスキーでの認証に失敗しました");
        }
      } else if (data?.session) {
        setInMemorySudoAuthorized(true);
        setMfaChallengeRequired(false);
        onSuccess();
      }
    } catch {
      setError("パスキー認証中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sudo-confirm-title"
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden p-6 text-center"
      >
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
            step === "mfa_totp" ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
          }`}
        >
          {step === "mfa_totp" ? (
            <ShieldCheck className="w-6 h-6" />
          ) : (
            <ShieldAlert className="w-6 h-6" />
          )}
        </div>

        <h2 id="sudo-confirm-title" className="text-xl font-bold text-gray-900 mb-1">
          {step === "mfa_totp" ? "2段階認証の確認" : "管理者権限の確認"}
        </h2>
        <p className="text-xs text-gray-500 mb-5 leading-relaxed">
          {step === "mfa_totp"
            ? "引き続いて、認証アプリに表示されている6桁のコードを入力してください。"
            : "ダッシュボードへのアクセスには、セキュリティ保護のためアカウントの再確認が必要です。パスワードを入力してください。"}
        </p>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-2 mb-4 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === "mfa_totp" ? (
          <form onSubmit={(e) => void handleVerifyTotp(e)} className="space-y-4">
            <div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                autoFocus
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                className="w-full text-center tracking-[0.4em] font-mono text-2xl border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || verifyCode.length !== 6 || !factorId}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {loading ? "認証中..." : "認証して進む"}
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <input
                  type="password"
                  placeholder="現在のパスワード"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-sm"
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
                  className="w-full py-2.5 border border-gray-200 text-gray-700 text-xs font-bold rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2 bg-white transition-colors disabled:opacity-50"
                >
                  <Key className="w-4 h-4 text-gray-600" />
                  パスキーで再認証
                </button>
              </div>
            )}
          </>
        )}

        <div className="pt-4 mt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>キャンセルして戻る</span>
          </button>
        </div>
      </div>
    </div>
  );
};
