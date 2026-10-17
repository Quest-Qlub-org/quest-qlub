import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { X, Copy, Check, ShieldCheck, AlertCircle, Download, KeyRound } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface MfaEnrollModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onEnrolled?: () => void;
  onSuccess?: () => void;
}

export const MfaEnrollModal = ({
  isOpen = true,
  onClose,
  onEnrolled,
  onSuccess,
}: MfaEnrollModalProps) => {
  const [step, setStep] = useState<"enroll" | "backup">("enroll");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [generatingBackupCodes, setGeneratingBackupCodes] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);
  const [error, setError] = useState("");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [copied, setCopied] = useState(false);

  const enrollingRef = useRef(false);

  const handleCancel = async () => {
    if (step === "backup") {
      handleFinish();
      return;
    }
    try {
      await supabase.rpc("clean_unverified_mfa_factors");
    } catch {
      // クリーンアップエラーは無視
    }
    onClose();
  };

  const modalRef = useFocusTrap<HTMLDivElement>(isOpen, () => {
    void handleCancel();
  });

  useEffect(() => {
    if (!isOpen) return;
    if (enrollingRef.current) return;
    enrollingRef.current = true;

    let isMounted = true;
    setLoading(true);
    setError("");
    setVerifyCode("");
    setCopied(false);

    const enroll = async () => {
      try {
        // 過去の未検証（unverified）なファクターが残っていれば一括クリーンアップ
        try {
          await supabase.rpc("clean_unverified_mfa_factors");
        } catch {
          // 一括削除エラーは無視して進める
        }

        // ユニークな friendlyName を使用して mfa_factors_user_friendly_name_unique 制約違反を防止
        const uniqueName = `Authenticator-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: uniqueName,
        });

        if (!isMounted) return;

        if (enrollErr) {
          setError(enrollErr.message || "2要素認証の初期化に失敗しました");
          setLoading(false);
          return;
        }

        setFactorId(data.id);
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
      } catch {
        if (isMounted) {
          setError("通信エラーが発生しました");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void enroll();

    return () => {
      isMounted = false;
      enrollingRef.current = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // クリップボード書き込み失敗時のフォールバック
      setCopied(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim() || !factorId) return;

    setVerifying(true);
    setError("");

    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        setError(challenge.error.message || "チャレンジの作成に失敗しました");
        setVerifying(false);
        return;
      }

      const verify = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: verifyCode.trim(),
      });

      if (verify.error) {
        setError(
          "認証コードが正しくありません。アプリに表示された最新の6桁コードを入力してください。",
        );
        setVerifying(false);
        return;
      }

      setGeneratingBackupCodes(true);

      // バックアップコードを自動生成
      try {
        const { data: codes, error: rpcErr } = await supabase.rpc("generate_mfa_backup_codes");
        if (!rpcErr && Array.isArray(codes) && codes.length > 0) {
          setBackupCodes(codes as string[]);
          setStep("backup");
          return;
        }
      } catch (e) {
        console.error("Failed to generate backup codes", e);
      }

      // 生成に万が一失敗した場合はそのまま完了
      onEnrolled?.();
      onSuccess?.();
      onClose();
    } catch {
      setError("認証処理中にエラーが発生しました");
    } finally {
      setVerifying(false);
      setGeneratingBackupCodes(false);
    }
  };

  const handleCopyAllCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {
      setCopiedAll(false);
    }
  };

  const handleDownloadCodes = () => {
    const content = [
      "Quest Qlub - 2段階認証バックアップコード",
      "=========================================",
      "これらのコードは、認証アプリにアクセスできなくなった際に",
      "ログインするために一度だけ使用できます。",
      "安全な場所に保管し、他者と共有しないでください。",
      "",
      ...backupCodes.map((code, idx) => `${idx + 1}. ${code}`),
      "",
      `生成日時: ${new Date().toLocaleString("ja-JP")}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sharequest-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFinish = () => {
    onEnrolled?.();
    onSuccess?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-enroll-title"
        className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden relative"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
              {step === "backup" ? (
                <KeyRound className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )}
            </div>
            <h3 id="mfa-enroll-title" className="font-bold text-gray-900 text-base">
              {step === "backup" ? "バックアップコードの保存" : "2要素認証 (TOTP) の設定"}
            </h3>
          </div>
          <button
            onClick={() => void handleCancel()}
            aria-label="閉じる"
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === "backup" ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-3.5 bg-green-50 border border-green-200 rounded-xl space-y-1.5">
                <p className="text-xs font-bold text-green-800 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-green-600" />
                  2要素認証が有効化されました！
                </p>
                <p className="text-xs text-green-700 leading-relaxed">
                  端末の紛失や機種変更時に備え、以下のバックアップコードを保存してください。各コードは認証アプリを使用できない場合に一度だけ利用可能です。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                {backupCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-1.5 bg-white rounded-lg border border-gray-200 text-xs font-mono font-bold text-gray-700 shadow-sm"
                  >
                    <span className="text-gray-400 text-[10px] select-none">{idx + 1}.</span>
                    <span>{code}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyAllCodes()}
                  className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border border-gray-200 transition-colors"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-green-600">コピー完了</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>すべてコピー</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCodes}
                  className="flex-1 py-2 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border border-gray-200 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>テキスト保存</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors mt-2"
              >
                安全な場所に保存しました（完了）
              </button>
            </div>
          ) : loading || generatingBackupCodes ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              {generatingBackupCodes ? "バックアップコードを生成中..." : "QRコードを生成中..."}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-700">
                  ステップ 1: 認証アプリでQRコードを読み取る
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Google Authenticator、1Password、Authy
                  などの認証アプリを起動し、以下のQRコードをスキャンしてください。
                </p>
                <div className="flex justify-center p-3 bg-white border border-gray-200 rounded-xl shadow-inner w-fit mx-auto">
                  {qrCode ? (
                    <img src={qrCode} alt="TOTP QR Code" className="w-44 h-44 object-contain" />
                  ) : (
                    <div className="w-44 h-44 flex items-center justify-center text-gray-400 text-xs">
                      QRコードの読み込みに失敗しました
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-gray-700">
                  QRコードをスキャンできない場合（手動キー）
                </p>
                <div className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <span className="font-mono text-xs text-gray-700 select-all flex-1 truncate">
                    {secret}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopySecret()}
                    className="p-1.5 text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 shrink-0 bg-white border border-gray-200 rounded hover:bg-blue-50 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-600">コピー完了</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>コピー</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <form onSubmit={(e) => void handleVerify(e)} className="space-y-4 pt-2">
                <div className="space-y-1">
                  <label className="block text-xs font-bold text-gray-700">
                    ステップ 2: 認証アプリに表示された6桁のコードを入力
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center tracking-[0.4em] font-mono text-xl border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={verifying || verifyCode.length !== 6}
                    className="flex-1 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {verifying ? "検証中..." : "有効化する"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    className="px-4 py-2.5 bg-gray-100 text-gray-600 text-sm font-bold rounded-xl hover:bg-gray-200 transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
