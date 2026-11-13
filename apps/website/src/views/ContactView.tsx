import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle, Clock, HelpCircle, Mail, Send, Shield } from "lucide-react";
import { supabase } from "../supabase";
import { validateContactForm } from "../utils/validation";
import {
  verifySpamCheck,
  getRemainingCooldownSeconds,
  recordSubmissionTimestamp,
} from "../utils/antiSpam";
import { updateMetaTags } from "../utils/seo";

export function ContactView() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [loadedAt] = useState(() => Date.now());
  const [cooldown, setCooldown] = useState(() => getRemainingCooldownSeconds());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    updateMetaTags({
      title: "お問い合わせ",
      description: "Quest Qlubへのお問い合わせ・ご要望窓口です。",
      url: "https://quest-qlub.vercel.app/contact",
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

  const handleSend = async () => {
    if (cooldown > 0) {
      setErr(`連続送信を防ぐため、あと${cooldown}秒お待ちください。`);
      return;
    }

    const spamCheck = verifySpamCheck({ honeypotValue: honeypot, loadedAt });
    if (spamCheck.isSpam) {
      if (spamCheck.reason === "honeypot") {
        // ステルス防御: ボットには成功画面を表示し、サーバーへは保存しない
        setSent(true);
        return;
      }
      if (spamCheck.reason === "too_fast") {
        setErr("送信が早すぎます。入力内容をご確認のうえ再度お試しください。");
        return;
      }
    }

    const validation = validateContactForm({ name, email, subject, body });
    if (!validation.isValid) {
      setErr(validation.error ?? "入力内容に誤りがあります");
      return;
    }
    setSending(true);
    setErr("");

    const { error } = await supabase.from("contact_messages").insert({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      body: body.trim(),
    });

    if (error) {
      setSending(false);
      setErr("送信に失敗しました。しばらくたってから再度お試しください。");
      return;
    }

    // 運営者宛てメール通知（失敗してもDBにメッセージは記録されているため警告ログに留め、ユーザーには送信完了を表示）
    try {
      const { error: fnError } = await supabase.functions.invoke("send-contact-email", {
        body: {
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          body: body.trim(),
          _hp: honeypot,
        },
      });

      if (fnError) {
        console.warn("send-contact-email notification returned error:", fnError);
      }
    } catch (fnErr) {
      console.warn("send-contact-email invocation failed:", fnErr);
    }

    recordSubmissionTimestamp();
    setCooldown(getRemainingCooldownSeconds());
    setSending(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="animate-in fade-in duration-300 min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="max-w-xl mx-auto px-4 py-8 md:py-16">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-green-50 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-green-100 dark:border-green-800">
              <CheckCircle className="w-8 h-8" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">送信完了</h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-w-md mx-auto">
              お問い合わせを受け付けました。返信までしばらくお待ちください。
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => nav(-1)}
                className="px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors cursor-pointer"
              >
                戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const errorId = err ? "contact-form-error" : undefined;

  return (
    <div className="animate-in fade-in duration-300 min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8 space-y-6">
        <button
          type="button"
          onClick={() => nav(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>戻る</span>
        </button>

        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-sm space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold">
            <Mail className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Contact Us</span>
          </div>
          <h1 className="text-2xl font-bold">お問い合わせ</h1>
          <p className="text-blue-100 text-xs md:text-sm leading-relaxed">
            ご質問・ご意見・不具合のご報告などはこちらからお気軽にお問い合わせください。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <aside className="md:col-span-5 space-y-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <HelpCircle
                  className="w-4 h-4 text-blue-600 dark:text-blue-400"
                  aria-hidden="true"
                />
                <span>お問い合わせの前に</span>
              </h2>
              <ul className="space-y-3 text-xs md:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                <li className="flex items-start gap-2.5">
                  <Clock
                    className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>内容を確認のうえ、通常 1〜3 営業日以内にご返信いたします。</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <Shield
                    className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>お送りいただいた個人情報は、お問い合わせへの回答のみに使用します。</span>
                </li>
              </ul>
              <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">関連ページ</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Link
                    to="/terms"
                    className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                  >
                    利用規約
                  </Link>
                  <Link
                    to="/privacy"
                    className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 font-medium transition-colors"
                  >
                    プライバシーポリシー
                  </Link>
                  <Link
                    to="/writer-apply"
                    className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-medium transition-colors"
                  >
                    ライター応募はこちら
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="md:col-span-7 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-5"
          >
            {err && (
              <div
                id="contact-form-error"
                role="alert"
                className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium"
              >
                {err}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="contact-name"
                  className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  お名前 <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  autoComplete="name"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(err)}
                  aria-describedby={errorId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例: 山田 太郎"
                  className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-email"
                  className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5"
                >
                  メールアドレス <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  autoComplete="email"
                  required
                  aria-required="true"
                  aria-invalid={Boolean(err)}
                  aria-describedby={errorId}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="例: example@email.com"
                  className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="contact-subject"
                className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5"
              >
                件名 <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <input
                id="contact-subject"
                type="text"
                required
                aria-required="true"
                aria-invalid={Boolean(err)}
                aria-describedby={errorId}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="例: 記事の内容について"
                className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="contact-body"
                className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5"
              >
                内容 <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <textarea
                id="contact-body"
                required
                aria-required="true"
                aria-invalid={Boolean(err)}
                aria-describedby={errorId}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder="お問い合わせ内容をご記入ください"
                className="w-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* ボット対策用ハニーポットフィールド（人間には不可視） */}
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
              <label htmlFor="_website_hp">ウェブサイト</label>
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

            <button
              type="submit"
              disabled={sending || cooldown > 0}
              className="w-full py-3 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span>
                {sending
                  ? "送信中..."
                  : cooldown > 0
                    ? `再送信まであと ${cooldown} 秒`
                    : "送信する"}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
