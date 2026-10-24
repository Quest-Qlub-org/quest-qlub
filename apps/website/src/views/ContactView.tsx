import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
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
      setSending(false);
      setErr("メールの送信処理に失敗しました。しばらくたってから再度お試しください。");
      return;
    }

    recordSubmissionTimestamp();
    setCooldown(getRemainingCooldownSeconds());
    setSending(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="p-4 sm:p-8 bg-white min-h-screen">
        <div className="max-w-xl mx-auto text-center pt-16">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">送信完了</h2>
          <p className="text-sm text-gray-500 mb-8">
            お問い合わせを受け付けました。返信までしばらくお待ちください。
          </p>
          <button
            onClick={() => nav(-1)}
            className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700"
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300 min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="bg-green-600 rounded-2xl p-6 mb-6 text-white">
          <button
            onClick={() => nav(-1)}
            className="flex items-center gap-1 text-green-100 hover:text-white text-sm mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            戻る
          </button>
          <h2 className="text-2xl font-bold">お問い合わせ</h2>
          <p className="text-green-100 text-sm mt-1">
            ご質問・ご意見・不具合のご報告などはこちらから。
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              お名前 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 山田 太郎"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              メールアドレス <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="例: example@email.com"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              件名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="例: 記事の内容について"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder="お問い合わせ内容をご記入ください"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
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

          {err && <p className="text-sm text-red-500">{err}</p>}
          <button
            type="submit"
            disabled={sending || cooldown > 0}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {sending ? "送信中..." : cooldown > 0 ? `再送信まであと ${cooldown} 秒` : "送信する"}
          </button>
        </form>
      </div>
    </div>
  );
}
