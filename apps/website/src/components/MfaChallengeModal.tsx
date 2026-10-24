import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { ShieldCheck, AlertCircle, LogOut, KeyRound } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface MfaChallengeModalProps {
  isOpen?: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
}

export const MfaChallengeModal = ({
  isOpen = true,
  onSuccess,
  onCancel,
}: MfaChallengeModalProps) => {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [fetchingFactor, setFetchingFactor] = useState(true);

  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, () => {
    if (onCancel) {
      onCancel();
    }
  });

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setFetchingFactor(true);
    setError("");
    setVerifyCode("");

    const fetchFactors = async () => {
      try {
        const { data, error: factorsErr } = await supabase.auth.mfa.listFactors();
        if (!isMounted) return;

        if (factorsErr) {
          setError("2要素認証情報の取得に失敗しました");
          return;
        }

        const verifiedTotp = data.totp.find((f) => f.status === "verified") ?? data.totp[0];
        if (verifiedTotp) {
          setFactorId(verifiedTotp.id);
        } else {
          setError("有効な2要素認証ファクターが見つかりませんでした");
        }
      } catch {
        if (isMounted) setError("通信エラーが発生しました");
      } finally {
        if (isMounted) setFetchingFactor(false);
      }
    };

    void fetchFactors();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
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

      onSuccess();
    } catch {
      setError("認証処理中にエラーが発生しました");
      setLoading(false);
    }
  };

  const handleVerifyBackupCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupCode.trim()) return;

    setLoading(true);
    setError("");

    try {
      const { data: isValid, error: rpcErr } = await supabase.rpc(
        "verify_and_consume_backup_code",
        {
          p_code: backupCode.trim(),
        },
      );

      if (rpcErr || !isValid) {
        setError("バックアップコードが正しくないか、すでに使用されています。");
        setLoading(false);
        return;
      }

      // 成功: 2FAはリセットされたのでセッションをリフレッシュして最新化
      await supabase.auth.refreshSession().catch(() => {});
      onSuccess();
    } catch {
      setError("認証処理中にエラーが発生しました");
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    if (onCancel) {
      onCancel();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-challenge-title"
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-sm overflow-hidden p-6 text-center"
      >
        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
          {mode === "backup" ? (
            <KeyRound className="w-6 h-6" />
          ) : (
            <ShieldCheck className="w-6 h-6" />
          )}
        </div>

        <h2
          id="mfa-challenge-title"
          className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1"
        >
          {mode === "backup" ? "バックアップコードでログイン" : "2段階認証の確認"}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
          {mode === "backup"
            ? "保管しておいた8桁のバックアップコードを入力してください。ログイン完了後、2段階認証は自動で解除されます。"
            : "アカウントのセキュリティ保護のため、認証アプリに表示されている6桁のコードを入力してください。"}
        </p>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-start gap-2 mb-4 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {mode === "backup" ? (
          <form onSubmit={(e) => void handleVerifyBackupCode(e)} className="space-y-4">
            <div>
              <input
                type="text"
                autoComplete="off"
                placeholder="例: abcd-1234"
                autoFocus
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value)}
                className="w-full text-center font-mono text-lg tracking-wider uppercase border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !backupCode.trim()}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {loading ? "検証中..." : "コードで認証してログイン"}
            </button>

            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMode("totp");
                  setError("");
                }}
                className="w-full text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold cursor-pointer"
              >
                認証アプリの6桁コード入力に戻る
              </button>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>別のアカウントでログイン</span>
              </button>
            </div>
          </form>
        ) : fetchingFactor ? (
          <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            認証設定を確認中...
          </div>
        ) : (
          <form onSubmit={(e) => void handleVerify(e)} className="space-y-4">
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
                className="w-full text-center tracking-[0.4em] font-mono text-2xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || verifyCode.length !== 6 || !factorId}
              className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {loading ? "認証中..." : "認証して進む"}
            </button>

            <div className="pt-2 border-t border-gray-100 dark:border-gray-700 space-y-2">
              <button
                type="button"
                onClick={() => {
                  setMode("backup");
                  setError("");
                }}
                className="w-full text-xs text-blue-600 dark:text-blue-400 hover:underline font-bold cursor-pointer"
              >
                認証アプリを使用できない場合（バックアップコード）
              </button>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>別のアカウントでログイン</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
