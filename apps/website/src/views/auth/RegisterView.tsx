import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabase";
import { useApp } from "../../context/AppContext";
import { validatePassword } from "../../utils/validation";
import {
  verifySpamCheck,
  getRemainingCooldownSeconds,
  recordSubmissionTimestamp,
  REGISTER_COOLDOWN_KEY,
} from "../../utils/antiSpam";
import { updateMetaTags } from "../../utils/seo";

export const RegisterView = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [loadedAt] = useState(() => Date.now());
  const [cooldown, setCooldown] = useState(() =>
    getRemainingCooldownSeconds(REGISTER_COOLDOWN_KEY),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { navigate, showToast } = useApp();

  useEffect(() => {
    updateMetaTags({
      title: "アカウント登録",
      noindex: true,
    });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (cooldown > 0) {
      setError(`連続登録を防ぐため、あと${cooldown}秒お待ちください。`);
      return;
    }

    const spamCheck = verifySpamCheck({ honeypotValue: honeypot, loadedAt });
    if (spamCheck.isSpam) {
      if (spamCheck.reason === "honeypot") {
        // ステルス防御: ボットには成功したように見せかけて本登録は行わない
        navigate("login");
        showToast("確認メールを送信しました。メールを確認してください。");
        return;
      }
      if (spamCheck.reason === "too_fast") {
        setError("送信が早すぎます。入力内容をご確認のうえ再度お試しください。");
        return;
      }
    }

    const passCheck = validatePassword(password);
    if (!passCheck.isValid) {
      setError(passCheck.error || "パスワードは8文字以上で入力してください");
      return;
    }

    if (!agreedToTerms) {
      setError("利用規約およびプライバシーポリシーへの同意が必要です");
      return;
    }

    setLoading(true);
    setError("");
    const { error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName, username: username.trim() } },
    });
    if (signUpErr) {
      setError(signUpErr.message);
    } else {
      recordSubmissionTimestamp(REGISTER_COOLDOWN_KEY);
      setCooldown(getRemainingCooldownSeconds(REGISTER_COOLDOWN_KEY));
      navigate("login");
      showToast("確認メールを送信しました。メールを確認してください。");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4 transition-colors">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-gray-100">
          アカウント登録
        </h1>
        {error && (
          <p
            id="register-error"
            role="alert"
            className="text-red-600 dark:text-red-400 text-sm mb-4 text-center"
          >
            {error}
          </p>
        )}
        <form onSubmit={handleRegister} className="space-y-4">
          {/* ボット対策ハニーポット */}
          <div
            style={{
              opacity: 0,
              position: "absolute",
              top: 0,
              left: "-9999px",
              height: 0,
              width: 0,
              overflow: "hidden",
              zIndex: -1,
            }}
            aria-hidden="true"
          >
            <label htmlFor="_reg_hp">Website</label>
            <input
              id="_reg_hp"
              type="text"
              name="_hp"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="register-display-name" className="sr-only">
              表示名
            </label>
            <input
              id="register-display-name"
              type="text"
              required
              aria-required="true"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "register-error" : undefined}
              placeholder="表示名 *"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="register-username" className="sr-only">
              ユーザー名（英数字・アンダースコアのみ）
            </label>
            <input
              id="register-username"
              type="text"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "register-error" : undefined}
              placeholder="ユーザー名（英数字・アンダースコアのみ）"
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="register-email" className="sr-only">
              メールアドレス
            </label>
            <input
              id="register-email"
              type="email"
              required
              aria-required="true"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "register-error" : undefined}
              placeholder="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="register-password" className="sr-only">
              パスワード（8文字以上）
            </label>
            <input
              id="register-password"
              type="password"
              required
              aria-required="true"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "register-error" : undefined}
              placeholder="パスワード（8文字以上）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex items-start gap-2.5">
              <input
                id="register-agree-terms"
                type="checkbox"
                required
                aria-required="true"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "register-error" : undefined}
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
              />
              <label
                htmlFor="register-agree-terms"
                className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed cursor-pointer"
              >
                <Link
                  to="/terms"
                  className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  利用規約
                </Link>
                および
                <Link
                  to="/privacy"
                  className="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  プライバシーポリシー
                </Link>
                に同意する <span className="text-red-600 dark:text-red-400">*</span>
              </label>
            </div>
            <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
              内容をご確認のうえチェックを入れて登録にお進みください。
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || cooldown > 0}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          >
            {loading ? "登録中..." : cooldown > 0 ? `再試行まであと ${cooldown} 秒` : "登録する"}
          </button>
        </form>
        <div className="mt-5 p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl text-center">
          <p className="text-xs text-gray-700 dark:text-gray-300 mb-2 font-medium">
            ライターとして記事を書きたい方は、登録後に応募フォームよりご申請ください
          </p>
          <button
            type="button"
            onClick={() => navigate("/writer-apply")}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-full hover:bg-blue-700 transition-colors shadow-sm cursor-pointer"
          >
            ライター応募フォームへ
          </button>
        </div>
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
          すでにアカウントをお持ちの方は
          <button
            onClick={() => navigate("login")}
            className="text-blue-600 dark:text-blue-400 underline ml-1 cursor-pointer"
          >
            ログイン
          </button>
        </p>
      </div>
    </div>
  );
};
