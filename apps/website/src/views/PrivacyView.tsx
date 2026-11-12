import { useEffect } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { updateMetaTags } from "../utils/seo";

export function PrivacyView() {
  const navigate = useNavigate();

  useEffect(() => {
    updateMetaTags({
      title: "プライバシーポリシー",
      description: "Quest Qlubのプライバシーポリシー（個人情報の取り扱い）をご確認いただけます。",
      url: "https://quest-qlub.vercel.app/privacy",
    });
  }, []);
  const sections: { title: string; text?: string; items?: string[] }[] = [
    {
      title: "1. 収集する情報",
      items: [
        "会員登録時に提供いただくメールアドレスおよび表示名",
        "任意でアップロードいただくプロフィールアイコン画像",
        "記事の閲覧数などのサービス利用に関するデータ",
      ],
    },
    {
      title: "2. 利用目的",
      items: [
        "サービスのご提供および運営・改善",
        "本人確認およびアカウント管理",
        "サービスに関する重要なお知らせの送信",
      ],
    },
    {
      title: "3. 第三者への提供",
      text: "当サービスは、法令に基づく場合を除き、ユーザーの個人情報を第三者に提供・開示しません。",
    },
    {
      title: "4. 情報の管理",
      text: "収集した情報はSupabaseを通じて安全に管理されます。不正アクセスや漏洩を防ぐため、適切な技術的措置を講じています。",
    },
    {
      title: "5. Cookieについて",
      text: "当サービスは、認証セッションの維持のためCookieを使用することがあります。ブラウザ設定で無効化可能ですが、一部機能をご利用いただけない場合があります。",
    },
    {
      title: "6. ポリシーの変更",
      text: "本プライバシーポリシーは、必要に応じて変更することがあります。重要な変更がある場合はサービス内でお知らせします。",
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
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Privacy Policy</span>
          </div>
          <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
          <p className="text-blue-100 text-xs md:text-sm leading-relaxed">最終更新日：2026年5月</p>
        </div>

        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          <p>
            Quest
            Qlub（以下「当サービス」）は、ユーザーの個人情報を適切に管理・保護することを最優先に考えています。
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
            <h2 className="font-bold text-gray-800 dark:text-gray-100 mb-1">お問い合わせ窓口</h2>
            <p>プライバシーに関するご質問はお問い合わせページからお気軽にどうぞ。</p>
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
