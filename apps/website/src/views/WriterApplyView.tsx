import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { useApp } from "../context/AppContext";
import { PenTool, CheckCircle, Send, ArrowLeft } from "lucide-react";
import { updateMetaTags } from "../utils/seo";

export const WriterApplyView = () => {
  const navigate = useNavigate();
  const { user, profile, showToast } = useApp();

  useEffect(() => {
    updateMetaTags({
      title: "ライター応募",
      description:
        "Quest Qlubであなたの知見やアイデアを発信しませんか？ライター応募を受け付けています。",
      url: "https://quest-qlub.vercel.app/writer-apply",
    });
  }, []);

  const [name, setName] = useState(profile?.display_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [hasEditedName, setHasEditedName] = useState(false);
  const [hasEditedEmail, setHasEditedEmail] = useState(false);

  useEffect(() => {
    if (!hasEditedName && profile?.display_name) {
      setName(profile.display_name);
    }
  }, [profile?.display_name, hasEditedName]);

  useEffect(() => {
    if (!hasEditedEmail && user?.email) {
      setEmail(user.email);
    }
  }, [user?.email, hasEditedEmail]);

  const [genres, setGenres] = useState<string[]>([]);
  const [portfolio, setPortfolio] = useState("");
  const [motivation, setMotivation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const GENRE_OPTIONS = [
    "プログラミング・Web開発",
    "デザイン・UI/UX",
    "AI・機械学習",
    "プロダクト開発・起業",
    "学習法・キャリア",
    "その他",
  ];

  const toggleGenre = (genre: string) => {
    setGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !motivation.trim()) {
      setError("お名前、メールアドレス、志望動機・メッセージは必須です。");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const subject = `【ライター応募】${name}様より`;
      const body = [
        `【応募者名】: ${name}`,
        `【メールアドレス】: ${email}`,
        `【希望執筆ジャンル】: ${genres.length > 0 ? genres.join(", ") : "未選択"}`,
        `【ポートフォリオ / 過去記事URL】: ${portfolio.trim() || "なし"}`,
        `【ユーザーID】: ${user?.id || "未ログイン"}`,
        `【志望動機・自己PR】:\n${motivation.trim()}`,
      ].join("\n");

      // 1. contact_messages テーブルに保存
      const { error: dbError } = await supabase.from("contact_messages").insert({
        name: name.trim(),
        email: email.trim(),
        subject,
        body,
      });

      if (dbError) {
        console.warn(
          "Could not insert into contact_messages, trying Edge Function fallback",
          dbError,
        );
      }

      // 2. send-contact-email Edge Function で運営者にメール通知
      let funcFailed = false;
      try {
        const { error: fnErr } = await supabase.functions.invoke("send-contact-email", {
          body: {
            name: name.trim(),
            email: email.trim(),
            subject,
            body,
          },
        });
        if (fnErr) funcFailed = true;
      } catch (funcErr) {
        funcFailed = true;
        console.warn("Edge function invocation notification failed", funcErr);
      }

      if (dbError && funcFailed) {
        setError(
          "送信に失敗しました。通信環境をご確認のうえ、しばらく経ってから再度お試しください。",
        );
        return;
      }

      setSubmitted(true);
      showToast("ライター応募を受け付けました");
    } catch {
      setError("送信中にエラーが発生しました。通信環境をご確認の上、再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-4 md:p-8 max-w-xl mx-auto animate-in fade-in duration-300">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-green-100 dark:border-green-800">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            ご応募ありがとうございます！
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed max-w-md mx-auto">
            ライター応募を受け付けました。運営チームにて内容を確認の上、1〜3営業日以内にご連絡いたします。
          </p>
          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate("/")}
              className="px-6 py-2.5 bg-gray-900 dark:bg-gray-700 text-white text-sm font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors cursor-pointer"
            >
              トップへ戻る
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="px-6 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              設定画面へ
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-xl mx-auto space-y-6 animate-in fade-in duration-300">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors font-medium cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>戻る</span>
      </button>

      <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <PenTool className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            ライター応募フォーム
          </h1>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          Quest Qlub
          であなたの知識や経験を記事として発信しませんか？以下の項目をご記入の上ご応募ください。
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 md:p-8 space-y-5"
      >
        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
            お名前・ペンネーム <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="山田 太郎"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setHasEditedName(true);
            }}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
            メールアドレス <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            placeholder="example@quest-qlub.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setHasEditedEmail(true);
            }}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
            希望執筆ジャンル（複数選択可）
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            {GENRE_OPTIONS.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => toggleGenre(genre)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                  genres.includes(genre)
                    ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                    : "bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
            ポートフォリオ・ブログ・過去記事URL（任意）
          </label>
          <input
            type="url"
            placeholder="https://github.com/..., https://zenn.dev/..."
            value={portfolio}
            onChange={(e) => setPortfolio(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
            志望動機・書きたい記事のテーマ <span className="text-red-500">*</span>
          </label>
          <textarea
            required
            rows={4}
            placeholder="得意な技術領域や、Quest Qlubで発信したい内容について自由にご記入ください。"
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>{submitting ? "送信中..." : "応募を送信する"}</span>
        </button>
      </form>
    </div>
  );
};
