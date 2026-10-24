import { useState, useEffect } from "react";
import { supabase } from "../../supabase";
import { useApp } from "../../context/AppContext";
import {
  verifySpamCheck,
  getRemainingCooldownSeconds,
  recordSubmissionTimestamp,
  FORGOT_PASSWORD_COOLDOWN_KEY,
} from "../../utils/antiSpam";
import { updateMetaTags } from "../../utils/seo";

export const ForgotPasswordView = () => {
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [loadedAt] = useState(() => Date.now());
  const [cooldown, setCooldown] = useState(() =>
    getRemainingCooldownSeconds(FORGOT_PASSWORD_COOLDOWN_KEY),
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { navigate, showToast } = useApp();

  useEffect(() => {
    updateMetaTags({
      title: "パスワード再設定",
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

  const handleSendEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (cooldown > 0) {
      setError(`連続送信を防ぐため、あと${cooldown}秒お待ちください。`);
      return;
    }

    const spamCheck = verifySpamCheck({ honeypotValue: honeypot, loadedAt });
    if (spamCheck.isSpam) {
      if (spamCheck.reason === "honeypot") {
        // ステルス防御
        setSuccess(true);
        showToast("再設定用メールを送信しました");
        return;
      }
      if (spamCheck.reason === "too_fast") {
        setError("送信が早すぎます。入力内容をご確認のうえ再度お試しください。");
        return;
      }
    }

    if (!email.trim()) {
      setError("メールアドレスを入力してください");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess(false);

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });

    if (resetErr) {
      setError(resetErr.message);
    } else {
      recordSubmissionTimestamp(FORGOT_PASSWORD_COOLDOWN_KEY);
      setCooldown(getRemainingCooldownSeconds(FORGOT_PASSWORD_COOLDOWN_KEY));
      setSuccess(true);
      showToast("再設定用メールを送信しました");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">パスワード再設定</h1>
        <p className="text-xs text-gray-500 text-center mb-6 font-medium">
          ご登録のメールアドレスに再設定用リンクをお送りします
        </p>
        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
            <p className="text-sm font-bold text-green-800">送信完了</p>
            <p className="text-xs text-green-600 mt-1">
              メールをご確認のうえ、リンクから再設定を行ってください。
            </p>
          </div>
        )}
        <form onSubmit={handleSendEmail} className="space-y-4">
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
            <label htmlFor="_forgot_hp">Website</label>
            <input
              id="_forgot_hp"
              type="text"
              name="_hp"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading || cooldown > 0}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? "送信中..."
              : cooldown > 0
                ? `再試行まであと ${cooldown} 秒`
                : "再設定メールを送信"}
          </button>
        </form>
        <div className="mt-4">
          <button
            onClick={() => navigate("login")}
            className="w-full py-3 border border-gray-300 text-gray-600 font-bold rounded-xl hover:bg-gray-50 bg-white"
          >
            ログイン画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
};
