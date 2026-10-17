import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
export function PrivacyView() {
  const navigate = useNavigate();
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
    <div className="animate-in fade-in duration-300 min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-blue-600 rounded-2xl p-6 mb-6 text-white">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-blue-100 hover:text-white text-sm mb-3"
          >
            <ChevronLeft className="w-4 h-4" />
            戻る
          </button>
          <h2 className="text-2xl font-bold">プライバシーポリシー</h2>
          <p className="text-blue-100 text-xs mt-1">最終更新日：2026年5月</p>
        </div>
        <div className="space-y-5 text-sm text-gray-600 leading-relaxed">
          <p>
            Quest
            Qlub（以下「当サービス」）は、ユーザーの個人情報を適切に管理・保護することを最優先に考えています。
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
            <h3 className="font-bold text-gray-800 mb-1">お問い合わせ窓口</h3>
            <p>プライバシーに関するご質問はお問い合わせページからお気軽にどうぞ。</p>
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
