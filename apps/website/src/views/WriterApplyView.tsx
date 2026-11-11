import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import { useApp } from "../context/AppContext";
import { PenTool, CheckCircle, Send, ArrowLeft } from "lucide-react";
import { updateMetaTags } from "../utils/seo";
import {
  verifySpamCheck,
  getRemainingCooldownSeconds,
  recordSubmissionTimestamp,
} from "../utils/antiSpam";
import { validateContactForm } from "../utils/validation";

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
  const [honeypot, setHoneypot] = useState("");
  const [loadedAt] = useState(() => Date.now());
  const [cooldown, setCooldown] = useState(() => getRemainingCooldownSeconds());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

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
    if (cooldown > 0) {
      setError(`連続送信を防ぐため、あと${cooldown}秒お待ちください。`);
      return;
    }

    if (!name.trim() || !email.trim() || !motivation.trim()) {
      setError("お名前、メールアドレス、志望動機・メッセージは必須です。");
      return;
    }

    const spamCheck = verifySpamCheck({ honeypotValue: honeypot, loadedAt });
    if (spamCheck.isSpam) {
      if (spamCheck.reason === "honeypot") {
        // ステルス防御: ボットには成功画面を表示し、サーバーへは保存しない
        setSubmitted(true);
        return;
      }
      if (spamCheck.reason === "too_fast") {
        setError("送信が早すぎます。入力内容をご確認のうえ再度お試しください。");
        return;
      }
    }

    const subject = `【ライター応募】${name.trim()}様より`;
    const body = [
      `【応募者名】: ${name.trim()}`,
      `【メールアドレス】: ${email.trim()}`,
      `【希望執筆ジャンル】: ${genres.length > 0 ? genres.join(", ") : "未選択"}`,
      `【ポートフォリオ / 過去記事URL】: ${portfolio.trim() || "なし"}`,
      `【ユーザーID】: ${user?.id || "未ログイン"}`,
      `【志望動機・自己PR】:\n${motivation.trim()}`,
    ].join("\n");

    const validation = validateContactForm({
      name: name.trim(),
      email: email.trim(),
      subject,
      body,
    });
    if (!validation.isValid) {
      setError(validation.error ?? "入力内容に誤りがあります");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // 1. contact_messages テーブルに保存
      const { error: dbError } = await supabase.from("contact_messages").insert({
        name: name.trim(),
        email: email.trim(),
        subject,
        body,
      });

      if (dbError) {
        setSubmitting(false);
        if (dbError.message?.includes("10分間に3件") || (dbError as any).code === "P0001") {
          setError(
            "短時間に多数の送信が行われました。10分ほど時間をおいてから再度お試しください。",
          );
        } else {
          setError(
            "送信に失敗しました。通信環境をご確認のうえ、しばらく経ってから再度お試しください。",
          );
        }
        return;
      }

      recordSubmissionTimestamp();
      setCooldown(getRemainingCooldownSeconds());

      // 2. send-contact-email Edge Function で運営者にメール通知
      try {
        await supabase.functions.invoke("send-contact-email", {
          body: {
            name: name.trim(),
            email: email.trim(),
            subject,
            body,
            _hp: honeypot,
          },
        });
      } catch (funcErr) {
        console.warn("Edge function invocation notification failed", funcErr);
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
              className="px-6 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900 font-bold text-sm rounded-xl transition-colors cursor-pointer"
            >
              トップへ戻る
            </button>
            <button
              onClick={() => {
                setSubmitted(false);
                setMotivation("");
                setPortfolio("");
                setGenres([]);
              }}
              className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold text-sm rounded-xl transition-colors cursor-pointer"
            >
              別の内容で応募する
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>戻る</span>
      </button>

      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-sm space-y-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold">
          <PenTool className="w-3.5 h-3.5" />
          <span>Writer Recruitment</span>
        </div>
        <h1 className="text-2xl font-bold">ライター応募フォーム</h1>
        <p className="text-blue-100 text-xs md:text-sm leading-relaxed">
          Quest Qlub
          では、知見や技術、アイデアを発信してコミュニティを盛り上げてくれるライターを随時募集しています。
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-5"
      >
        {/* Honeypot field (hidden from real users, attractive to bots) */}
        <div
          style={{
            position: "absolute",
            left: "-9999px",
            opacity: 0,
            pointerEvents: "none",
          }}
          aria-hidden="true"
        >
          <label htmlFor="_website_hp">Leave this field empty</label>
          <input
            id="_website_hp"
            type="text"
            name="_hp"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        {error && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              お名前 / ペンネーム <span className="text-red-500">*</span>
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
          disabled={submitting || cooldown > 0}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>
            {submitting
              ? "送信中..."
              : cooldown > 0
                ? `送信待機中 (${cooldown}秒)`
                : "応募を送信する"}
          </span>
        </button>
      </form>
    </div>
  );
};
