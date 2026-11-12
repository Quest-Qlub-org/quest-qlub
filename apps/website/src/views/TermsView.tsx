import { useEffect } from "react";
import { ArrowLeft, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { updateMetaTags } from "../utils/seo";

export function TermsView() {
  const navigate = useNavigate();

  useEffect(() => {
    updateMetaTags({
      title: "利用規約",
      description: "Quest Qlubの利用規約をご確認いただけます。",
      url: "https://quest-qlub.vercel.app/terms",
    });
  }, []);
  const sections: { title: string; text?: string; items?: string[] }[] = [
    {
      title: "1. サービスの目的",
      text: "当サービスは、学びの楽しさを共有することを目的とした記事プラットフォームです。ライターが執筆した記事を通じて、多くの方に学びの魅力を届けることを目指しています。",
    },
    {
      title: "2. 禁止事項",
      items: [
        "他のユーザーへの訹謗中傷・嫌がらせ行為",
        "虚偽・不正確な情報の意図的な投稿",
        "第三者の著作権・知的財産権を侵害するコンテンツの投稿",
        "スパムや広告目的のコンテンツの投稿",
        "当サービスの運営を妨害する一切の行為",
        "法令に違反する行為",
      ],
    },
    {
      title: "3. 知的財産権",
      text: "当サービス上のコンテンツ（記事・デザイン・ロゴ等）の著作権は、各ライターまたは当サービスに帰属します。無断転載・複製は禁止します。",
    },
    {
      title: "4. 免責事項",
      text: "当サービスは、掃載されている記事の正確性・完全性を保証しません。記事の内容はライター個人の見解であり、当サービスの公式見解ではありません。",
    },
    {
      title: "5. アカウントの管理",
      text: "ユーザーは自身のアカウント情報を適切に管理する責任を負います。アカウントの不正利用により生じた損害について、当サービスは責任を負いません。",
    },
    {
      title: "6. サービスの変更・終了",
      text: "当サービスは、事前の通知なくサービス内容の変更や終了を行う場合があります。",
    },
    {
      title: "7. 規約の変更",
      text: "当サービスは、必要に応じて本利用規約を変更することがあります。変更後も引き続きご利用いただいた場合、変更後の規約に同意したものとみなします。",
    },
  ];
  return (
    <div className="animate-in fade-in duration-300 min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 space-y-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>戻る</span>
        </button>

        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-sm space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-semibold">
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Terms of Service</span>
          </div>
          <h1 className="text-2xl font-bold">利用規約</h1>
          <p className="text-blue-100 text-xs md:text-sm leading-relaxed">最終更新日：2026年5月</p>
        </div>

        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          <p>
            Quest
            Qlub（以下「当サービス」）をご利用いただく前に、以下の利用規約をお読みください。サービスをご利用いただくことで、本規約に同意したものとみなします。
          </p>
          {sections.map((s) => (
            <div
              key={s.title}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
            >
              <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-2 text-sm">{s.title}</h2>
              {s.items ? (
                <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300">
                  {s.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600 dark:text-gray-300">{s.text}</p>
              )}
            </div>
          ))}
          <div className="bg-blue-50 dark:bg-blue-950/40 rounded-2xl p-6 border border-blue-100 dark:border-blue-900/60 text-blue-900 dark:text-blue-200">
            <p>規約に関するご質問はお問い合わせページからお気軽にどうぞ。</p>
            <button
              type="button"
              onClick={() => navigate("/contact")}
              className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 cursor-pointer"
            >
              お問い合わせはこちら
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
