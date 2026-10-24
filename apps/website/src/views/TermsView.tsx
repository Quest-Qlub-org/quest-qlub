import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
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
    <div className="animate-in fade-in duration-300 min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-purple-600 rounded-2xl p-6 mb-6 text-white">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-purple-100 hover:text-white text-sm mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            戻る
          </button>
          <h2 className="text-2xl font-bold">利用規約</h2>
          <p className="text-purple-100 text-xs mt-1">最終更新日：2026年5月</p>
        </div>
        <div className="space-y-4 text-sm text-gray-600 leading-relaxed">
          <p>
            Quest
            Qlub（以下「当サービス」）をご利用いただく前に、以下の利用規約をお読みください。サービスをご利用いただくことで、本規約に同意したものとみなします。
          </p>
          {sections.map((s) => (
            <div key={s.title} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-2 text-sm">{s.title}</h3>
              {s.items ? (
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  {s.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600">{s.text}</p>
              )}
            </div>
          ))}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <p>規約に関するご質問はお問い合わせページからお気軽にどうぞ。</p>
            <button
              onClick={() => navigate("/contact")}
              className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700"
            >
              お問い合わせはこちら
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
