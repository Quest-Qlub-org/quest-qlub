import { useState, useEffect, useRef } from "react";
import { supabase } from "../../supabase";
import { useApp } from "../../context/AppContext";
import { setInMemorySudoAuthorized } from "../../components/RoleRoute";
import { Key, ShieldCheck, AlertCircle, LogOut, KeyRound } from "lucide-react";
import { updateMetaTags } from "../../utils/seo";

export const LoginView = () => {
  const [step, setStep] = useState<"credentials" | "mfa_totp" | "mfa_backup">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [fetchingFactor, setFetchingFactor] = useState(false);
  const [isPasskeySupported, setIsPasskeySupported] = useState(false);
  const { navigate, setMfaChallengeRequired, refreshProfile } = useApp();

  useEffect(() => {
    updateMetaTags({
      title: "ログイン",
      noindex: true,
    });
  }, []);

  const isMfaCompletedRef = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (typeof window !== "undefined" && !!window.PublicKeyCredential) {
      setIsPasskeySupported(true);
    }
  }, []);

  // 2FA未完了離脱時の自動セッション破棄（Leave-to-Lock 防御）
  useEffect(() => {
    return () => {
      if (
        (stepRef.current === "mfa_totp" || stepRef.current === "mfa_backup") &&
        !isMfaCompletedRef.current
      ) {
        try {
          sessionStorage.removeItem("quest_qlub_sudo_at");
        } catch {
          // ignore
        }
        void supabase.auth.signOut().catch(() => {});
      }
    };
  }, []);

  const prepareMfaStep = async () => {
    setFetchingFactor(true);
    setError("");
    setVerifyCode("");
    try {
      const { data, error: factorsErr } = await supabase.auth.mfa.listFactors();
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
      setError("通信エラーが発生しました");
    } finally {
      setFetchingFactor(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError("");
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) {
      setError("メールアドレスまたはパスワードが間違っています");
      setLoading(false);
      return;
    }

    // 2FA設定の確認: AAL2が要求されている場合は画面遷移を保留し、インライン2FAステップへ切り替える
    try {
      const { data: mfaLevel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (mfaLevel && mfaLevel.currentLevel === "aal1" && mfaLevel.nextLevel === "aal2") {
        setStep("mfa_totp");
        setLoading(false);
        void prepareMfaStep();
        return;
      }
    } catch (err) {
      console.warn("MFA level check error", err);
    }

    // MFA不要の通常アカウント、またはすでにAAL2完了済みの場合はメイン画面へ遷移
    isMfaCompletedRef.current = true;
    setMfaChallengeRequired(false);
    setInMemorySudoAuthorized(true);
    await refreshProfile();
    try {
      sessionStorage.setItem("quest_qlub_sudo_at", Date.now().toString());
    } catch {
      // ignore
    }
    navigate("home");
    setLoading(false);
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

      // AAL2検証完了: AuthContext の mfaChallengeRequired を確実に解除してからホームへ遷移
      isMfaCompletedRef.current = true;
      setMfaChallengeRequired(false);
      setInMemorySudoAuthorized(true);
      await refreshProfile();
      try {
        sessionStorage.setItem("quest_qlub_sudo_at", Date.now().toString());
      } catch {
        // ignore
      }
      navigate("home");
    } catch {
      setError("認証処理中にエラーが発生しました");
    } finally {
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

      // 成功: 2FAリセットセッションをリフレッシュ
      await supabase.auth.refreshSession().catch(() => {});
      isMfaCompletedRef.current = true;
      setMfaChallengeRequired(false);
      setInMemorySudoAuthorized(true);
      await refreshProfile();
      try {
        sessionStorage.setItem("quest_qlub_sudo_at", Date.now().toString());
      } catch {
        // ignore
      }
      navigate("home");
    } catch {
      setError("認証処理中にエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelMfa = async () => {
    // 2FA未完了のままセッションが残らないよう完全にサインアウト
    setLoading(true);
    try {
      sessionStorage.removeItem("quest_qlub_sudo_at");
      setInMemorySudoAuthorized(false);
      setMfaChallengeRequired(false);
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      setStep("credentials");
      setVerifyCode("");
      setBackupCode("");
      setError("");
      setFactorId(null);
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: passkeyErr } = await supabase.auth.signInWithPasskey();
      if (passkeyErr) {
        if (passkeyErr.name !== "NotAllowedError") {
          setError(passkeyErr.message || "パスキーでのログインに失敗しました");
        }
      } else if (data?.session) {
        isMfaCompletedRef.current = true;
        setMfaChallengeRequired(false);
        setInMemorySudoAuthorized(true);
        await refreshProfile();
        try {
          sessionStorage.setItem("quest_qlub_sudo_at", Date.now().toString());
        } catch {
          // ignore
        }
        navigate("home");
      }
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") {
        setError("パスキーログイン中にエラーが発生しました");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError("");
    const { error: googleErr } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (googleErr) setError(googleErr.message);
    setLoading(false);
  };

  // Step 2: 2段階認証 (TOTP または バックアップコード)
  if (step === "mfa_totp" || step === "mfa_backup") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            {step === "mfa_backup" ? (
              <KeyRound className="w-6 h-6" />
            ) : (
              <ShieldCheck className="w-6 h-6" />
            )}
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {step === "mfa_backup" ? "バックアップコードでログイン" : "2段階認証の確認"}
          </h1>
          <p className="text-xs text-gray-500 mb-5 leading-relaxed">
            {step === "mfa_backup"
              ? "保管しておいた8桁のバックアップコードを入力してください。ログイン完了後、2段階認証は自動で解除されます。"
              : "アカウントのセキュリティ保護のため、認証アプリに表示されている6桁のコードを入力してください。"}
          </p>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-start gap-2 mb-4 text-left">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === "mfa_backup" ? (
            <form onSubmit={(e) => void handleVerifyBackupCode(e)} className="space-y-4">
              <div>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="例: abcd-1234"
                  autoFocus
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  className="w-full text-center font-mono text-lg tracking-wider uppercase border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !backupCode.trim()}
                className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {loading ? "検証中..." : "コードで認証してログイン"}
              </button>

              <div className="pt-2 border-t border-gray-100 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("mfa_totp");
                    setError("");
                  }}
                  className="w-full text-xs text-blue-600 hover:underline font-bold"
                >
                  認証アプリの6桁コード入力に戻る
                </button>

                <button
                  type="button"
                  onClick={() => void handleCancelMfa()}
                  disabled={loading}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>別のアカウントでログイン</span>
                </button>
              </div>
            </form>
          ) : fetchingFactor ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              認証設定を確認中...
            </div>
          ) : (
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

              <div className="pt-2 border-t border-gray-100 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep("mfa_backup");
                    setError("");
                  }}
                  className="w-full text-xs text-blue-600 hover:underline font-bold"
                >
                  認証アプリを使用できない場合（バックアップコード）
                </button>

                <button
                  type="button"
                  onClick={() => void handleCancelMfa()}
                  disabled={loading}
                  className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
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
  }

  // Step 1: メール & パスワード入力フォーム
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">ログイン</h1>
        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="space-y-1">
            <input
              type="password"
              placeholder="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-right">
              <button
                type="button"
                onClick={() => navigate("forgotPassword")}
                className="text-xs text-blue-600 hover:underline font-bold"
              >
                パスワードをお忘れの方はこちら
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "ログイン中..." : "ログイン"}
          </button>
        </form>

        <div className="space-y-4 mt-4">
          <div className="relative my-4 flex py-1 items-center">
            <div className="flex-grow border-t border-gray-200"></div>
            <span className="flex-shrink mx-4 text-gray-400 text-xs font-bold">または</span>
            <div className="flex-grow border-t border-gray-200"></div>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2 bg-white transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69c-.29 1.5-.1.84-2.48 2.43v2.01h4.02c2.34-2.15 3.69-5.32 3.69-8.29z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.83-2.97c-1.08.73-2.46 1.16-4.1 1.16-3.15 0-5.81-2.13-6.76-5.01H1.17v3.1A11.988 11.988 0 0 0 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.24 14.27a7.25 7.25 0 0 1 0-4.54V6.63H1.17a11.98 11.98 0 0 0 0 10.74l4.07-3.1z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A11.988 11.988 0 0 0 1.17 6.63l4.07 3.1c.95-2.88 3.61-5.01 6.76-5.01z"
              />
            </svg>
            Googleでログイン
          </button>

          {isPasskeySupported && (
            <button
              onClick={handlePasskeyLogin}
              disabled={loading}
              className="w-full py-3 border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2 bg-white transition-colors disabled:opacity-50"
            >
              <Key className="w-5 h-5 text-gray-600" />
              パスキーでログイン
            </button>
          )}
        </div>
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400 mb-2">アカウントをお持ちでない方</p>
          <button
            onClick={() => navigate("register")}
            className="w-full py-3 border-2 border-blue-500 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-colors"
          >
            新規アカウント登録
          </button>
        </div>
      </div>
    </div>
  );
};
