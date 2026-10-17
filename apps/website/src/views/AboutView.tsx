import imgTitleDetail from "../assets/brand_title_detail.png";

import { useApp } from "../context/AppContext";
import { LogoIcon } from "../components/icons/NavIcons";

export const AboutView = () => {
  const { navigate } = useApp();
  return (
    <div className="p-6 space-y-6 animate-in slide-in-from-bottom-4 duration-300 bg-white min-h-screen">
      <div className="text-center py-8">
        <LogoIcon className="w-20 h-20 mx-auto mb-4" />
        <img
          src={imgTitleDetail}
          className="h-24 md:h-28 object-contain mx-auto mb-2"
          alt="Quest Qlub - 学びの『楽しい！』をつなげる -"
        />
      </div>
      <div className="space-y-6">
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="font-bold text-gray-800 border-b-2 border-blue-200 pb-2 mb-3 inline-block">
            Quest Qlub とは
          </h3>
          <p className="text-sm text-gray-600 leading-loose">
            　「学びの『楽しい！』をつなげる」をモットーに、ライターによって書かれる記事から、「学ぶこと」の楽しさや面白さを届けるコンテンツです。
          </p>
          <p className="text-sm text-gray-600 leading-loose mt-2">
            　「勉強」という固い縛りではなく、「気になったことを広げたい」、「学ぶこと自体が楽しい」と思えるようなコンテンツを目指しています。
          </p>
        </div>
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="font-bold text-gray-800 border-b-2 border-blue-200 pb-2 mb-3 inline-block">
            主な活動
          </h3>
          <p className="text-sm text-gray-600 leading-loose">
            　Quest
            Qlubのライターが、「楽しい」「おもしろい」と感じたことを記事にすることで、その輪を広げています。
          </p>
          <p className="text-sm text-gray-600 leading-loose mt-2">
            　一人でも多くの方に学びの楽しさを伝えられるよう活動しています。
          </p>
        </div>
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="font-bold text-gray-800 border-b-2 border-blue-200 pb-2 mb-3 inline-block">
            ライター
          </h3>
          <div className="mb-3">
            <span className="inline-block text-xs font-bold text-white bg-blue-500 px-2 py-0.5 rounded-full mb-2">
              編集長
            </span>
            <p className="text-sm text-gray-700 font-bold pl-1">東雲　-Shinonome-</p>
          </div>
          <div>
            <span className="inline-block text-xs font-bold text-white bg-gray-400 px-2 py-0.5 rounded-full mb-2">
              ライター
            </span>
            <ul className="text-sm text-gray-600 space-y-1 pl-1">
              <li>天羽 楽　-TENBA Gaku-</li>
              <li>るーと　-Root-</li>
            </ul>
          </div>
          <button
            onClick={() => navigate("writers")}
            className="mt-3 text-sm text-blue-500 font-bold underline hover:text-blue-700"
          >
            ＞ 編集者一覧へ
          </button>
        </div>
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="font-bold text-gray-800 border-b-2 border-blue-200 pb-2 mb-3 inline-block">
            エンジニア
          </h3>
          <p className="text-sm text-gray-600">・Noimzip</p>
          <p className="text-sm text-gray-600 mt-1">・るーと</p>
        </div>
        <button
          onClick={() => navigate("home")}
          className="w-full py-3 bg-gray-100 font-bold rounded-xl text-gray-600 hover:bg-gray-200"
        >
          ホームへ戻る
        </button>
      </div>
    </div>
  );
};
