import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabase";
import {
  ShieldCheck,
  Key,
  Smartphone,
  Trash2,
  Plus,
  Loader2,
  Download,
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  X,
} from "lucide-react";
import { MfaEnrollModal } from "../../components/MfaEnrollModal";
import { useFocusTrap } from "../../hooks/useFocusTrap";

type FactorItem = {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
  created_at: string;
};

type PasskeyItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

export function SecuritySettingsSection({ showToast }: { showToast: (msg: string) => void }) {
  const [totpFactors, setTotpFactors] = useState<FactorItem[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [unrollingId, setUnenrollingId] = useState<string | null>(null);
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null);

  // バックアップコード状態
  const [backupCodesStatus, setBackupCodesStatus] = useState<{
    total: number;
    remaining: number;
  } | null>(null);
  const [regeneratingCodes, setRegeneratingCodes] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [copiedNewCodes, setCopiedNewCodes] = useState(false);

  const backupModalRef = useFocusTrap<HTMLDivElement>(showBackupModal, () => {
    setShowBackupModal(false);
  });

  const isPasskeySupported =
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function";

  const fetchSecurityData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch MFA Factors
      const { data: factorsData, error: mfaError } = await supabase.auth.mfa.listFactors();
      if (!mfaError && factorsData) {
        const verifiedTotp = factorsData.all.filter(
          (f) => f.factor_type === "totp" && f.status === "verified",
        );
        setTotpFactors(verifiedTotp);
      }

      // Fetch Passkeys
      if (supabase.auth.passkey) {
        const { data: passkeysData, error: passkeyError } = await supabase.auth.passkey.list();
        if (!passkeyError && passkeysData) {
          setPasskeys(passkeysData);
        }
      }

      // Fetch Backup Codes Status
      const { data: bcStatus } = await supabase.rpc("get_mfa_backup_codes_status");
      if (bcStatus) {
        setBackupCodesStatus(bcStatus as { total: number; remaining: number });
      }
    } catch (e) {
      console.error("Failed to load security settings", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSecurityData();
  }, [fetchSecurityData]);

  const handleRegenerateBackupCodes = async () => {
    if (
      !window.confirm(
        "新しいバックアップコードを生成しますか？\n現在保存している古いコードはすべて無効になります。",
      )
    ) {
      return;
    }
    setRegeneratingCodes(true);
    try {
      const { data, error } = await supabase.rpc("generate_mfa_backup_codes");
      if (error || !data) {
        showToast("バックアップコードの生成に失敗しました: " + (error?.message || ""));
      } else {
        setNewBackupCodes(data as string[]);
        setShowBackupModal(true);
        void fetchSecurityData();
      }
    } catch {
      showToast("バックアップコードの生成中にエラーが発生しました");
    } finally {
      setRegeneratingCodes(false);
    }
  };

  const handleDownloadNewCodes = () => {
    const content = [
      "Quest Qlub - 2段階認証バックアップコード",
      "=========================================",
      "これらのコードは、認証アプリにアクセスできなくなった際に",
      "ログインするために一度だけ使用できます。",
      "安全な場所に保管し、他者と共有しないでください。",
      "",
      ...newBackupCodes.map((code, idx) => `${idx + 1}. ${code}`),
      "",
      `生成日時: ${new Date().toLocaleString("ja-JP")}`,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quest-qlub-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyNewCodes = async () => {
    try {
      await navigator.clipboard.writeText(newBackupCodes.join("\n"));
      setCopiedNewCodes(true);
      setTimeout(() => setCopiedNewCodes(false), 2500);
    } catch {
      setCopiedNewCodes(false);
    }
  };

  const handleDisableTotp = async (factorId: string) => {
    if (!window.confirm("2段階認証を解除しますか？アカウントのセキュリティ強度が低下します。")) {
      return;
    }
    setUnenrollingId(factorId);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      showToast("2段階認証の解除に失敗しました: " + error.message);
    } else {
      showToast("2段階認証を解除しました");
      await fetchSecurityData();
    }
    setUnenrollingId(null);
  };

  const handleRegisterPasskey = async () => {
    setIsRegisteringPasskey(true);
    try {
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) {
        showToast("パスキーの登録に失敗しました: " + error.message);
      } else if (data) {
        showToast("パスキーを登録しました");
        await fetchSecurityData();
      }
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") {
        showToast("パスキーの登録中にエラーが発生しました");
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    if (!window.confirm("このパスキーを削除しますか？")) {
      return;
    }
    setDeletingPasskeyId(passkeyId);
    try {
      const { error } = await supabase.auth.passkey.delete({ passkeyId });
      if (error) {
        showToast("パスキーの削除に失敗しました: " + error.message);
      } else {
        showToast("パスキーを削除しました");
        await fetchSecurityData();
      }
    } catch {
      showToast("パスキーの削除中にエラーが発生しました");
    } finally {
      setDeletingPasskeyId(null);
    }
  };

  const isTotpEnabled = totpFactors.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h2 className="font-bold text-gray-800 dark:text-gray-100 text-base">セキュリティ設定</h2>
      </div>

      <div className="p-4 space-y-6">
        {/* 2要素認証（TOTP）設定 */}
        <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                  2要素認証（TOTP / 認証アプリ）
                </span>
                {isTotpEnabled ? (
                  <span className="px-2 py-0.5 text-xs font-bold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-full">
                    有効
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                    未設定
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Google Authenticator や 1Password
                などの認証アプリを使用して、ログイン時に6桁の確認コードを要求します。
              </p>
            </div>
            {isTotpEnabled ? (
              <button
                onClick={() => void handleDisableTotp(totpFactors[0].id)}
                disabled={unrollingId !== null || loading}
                className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 flex items-center gap-1"
              >
                {unrollingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                解除する
              </button>
            ) : (
              <button
                onClick={() => setEnrollModalOpen(true)}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                有効にする
              </button>
            )}
          </div>
        </div>

        {/* バックアップコード設定 (TOTP有効時のみ) */}
        {isTotpEnabled && (
          <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-800/50">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                    緊急用バックアップコード
                  </span>
                  {backupCodesStatus && (
                    <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                      残り {backupCodesStatus.remaining} / {backupCodesStatus.total || 10} 個
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  認証アプリにアクセスできなくなった場合の非常用コードです。再生成を行うと、以前のコードはすべて無効になります。
                </p>
              </div>
              <button
                onClick={() => void handleRegenerateBackupCodes()}
                disabled={regeneratingCodes || loading}
                className="px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
              >
                {regeneratingCodes ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                )}
                コードを再生成
              </button>
            </div>
          </div>
        )}

        {/* パスキー設定 */}
        <div className="border border-gray-100 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-800/50">
          <div className="flex items-start justify-between mb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                  パスキー（生体認証 / セキュリティキー）
                </span>
                {passkeys.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full">
                    {passkeys.length}件 登録済み
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                Touch ID、Face ID、Windows Hello
                などの端末の生体認証を使って、パスワード不要で安全にログインできます。
              </p>
            </div>
            {isPasskeySupported && (
              <button
                onClick={() => void handleRegisterPasskey()}
                disabled={isRegisteringPasskey || loading}
                className="px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
              >
                {isRegisteringPasskey ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                パスキーを登録
              </button>
            )}
          </div>

          {!isPasskeySupported ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50">
              ※お使いのブラウザや環境はパスキー（WebAuthn）に対応していません。
            </p>
          ) : passkeys.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 py-2">
              登録済みのパスキーはありません。「パスキーを登録」ボタンから現在の端末を登録できます。
            </p>
          ) : (
            <div className="space-y-2 mt-3">
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  className="flex items-center justify-between p-2.5 bg-white dark:bg-gray-700/60 rounded-lg border border-gray-200 dark:border-gray-600 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Key className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <div className="truncate">
                      <p className="font-bold text-gray-700 dark:text-gray-200 truncate">
                        {pk.friendly_name || "パスキー"}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        登録日: {new Date(pk.created_at).toLocaleDateString("ja-JP")}
                        {pk.last_used_at && (
                          <span className="ml-2">
                            最終利用: {new Date(pk.last_used_at).toLocaleDateString("ja-JP")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void handleDeletePasskey(pk.id)}
                    disabled={deletingPasskeyId === pk.id}
                    title="パスキーを削除"
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 flex-shrink-0"
                  >
                    {deletingPasskeyId === pk.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {enrollModalOpen && (
        <MfaEnrollModal
          onSuccess={() => {
            setEnrollModalOpen(false);
            showToast("2段階認証を有効化しました");
            void fetchSecurityData();
          }}
          onClose={() => setEnrollModalOpen(false)}
        />
      )}

      {showBackupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            ref={backupModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="backup-codes-title"
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden relative"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg">
                  <KeyRound className="w-5 h-5" />
                </div>
                <h3
                  id="backup-codes-title"
                  className="font-bold text-gray-900 dark:text-gray-100 text-base"
                >
                  新しいバックアップコード
                </h3>
              </div>
              <button
                onClick={() => setShowBackupModal(false)}
                aria-label="閉じる"
                className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl space-y-1">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-200">
                  新しいコードが発行されました
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                  以前のバックアップコードはすべて無効化されました。以下の10個の新しいコードを安全な場所に保管してください。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
                {newBackupCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-mono font-bold text-gray-700 dark:text-gray-200 shadow-sm"
                  >
                    <span className="text-gray-400 dark:text-gray-500 text-[10px] select-none">
                      {idx + 1}.
                    </span>
                    <span>{code}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyNewCodes()}
                  className="flex-1 py-2 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-600 transition-colors"
                >
                  {copiedNewCodes ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      <span className="text-green-600 dark:text-green-400">コピー完了</span>
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
                  onClick={handleDownloadNewCodes}
                  className="flex-1 py-2 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-600 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>テキスト保存</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowBackupModal(false)}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors mt-2"
              >
                保存しました（閉じる）
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
