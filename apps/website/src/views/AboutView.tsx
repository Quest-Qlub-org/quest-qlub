import { useEffect } from "react";
import imgTitleDetail from "../assets/brand_title_detail.png";
import { useApp } from "../context/AppContext";
import { LogoIcon } from "../components/icons/NavIcons";
import {
  getProfileRoles,
  profileHasRole,
  getRoleLabel,
  getRoleOrder,
  isStaffRole,
  formatMemberName,
} from "../utils/roles";

export const AboutView = () => {
  const { navigate, teamMembers, teamMembersLoading, refreshTeamMembers } = useApp();

  useEffect(() => {
    if (typeof refreshTeamMembers === "function") {
      void refreshTeamMembers();
    }
  }, [refreshTeamMembers]);

  // ロールごとにメンバーを動的分類
  const editors = teamMembers.filter((m) => profileHasRole(m, "editor"));
  // 編集長は同一カード内の「編集長」枠に掲載されるため、「ライター」枠での重複表示を防ぐ
  const writersList = teamMembers.filter(
    (m) => profileHasRole(m, "writer") && !editors.some((e) => e.id === m.id),
  );
  const engineers = teamMembers.filter((m) => profileHasRole(m, "engineer"));

  // その他カスタムスタッフロール（editor, writer, engineer, viewer, guest 以外）
  const otherRoleKeys = Array.from(
    new Set(
      teamMembers
        .flatMap((m) => getProfileRoles(m))
        .filter((r) => isStaffRole(r) && !["editor", "writer", "engineer"].includes(r)),
    ),
  ).sort((a, b) => getRoleOrder(a) - getRoleOrder(b));

  const otherRoleGroups = otherRoleKeys
    .map((roleKey) => ({
      role: roleKey,
      label: getRoleLabel(roleKey),
      members: teamMembers.filter((m) => profileHasRole(m, roleKey)),
    }))
    .filter((g) => g.members.length > 0);

  const hasAnyMembers =
    editors.length > 0 ||
    writersList.length > 0 ||
    engineers.length > 0 ||
    otherRoleGroups.length > 0;

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

        {/* メンバー読み込み中スケルトン */}
        {teamMembersLoading && !hasAnyMembers && (
          <div
            data-testid="members-loading-skeleton"
            className="bg-gray-50 p-5 rounded-xl border border-gray-100 animate-pulse space-y-4"
          >
            <div className="h-5 bg-gray-200 rounded w-24 mb-3" />
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-4 bg-gray-200 rounded w-48" />
            </div>
            <div className="space-y-2 pt-2">
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-4 bg-gray-200 rounded w-40" />
            </div>
          </div>
        )}

        {/* ライター・編集長セクション */}
        {(editors.length > 0 || writersList.length > 0) && (
          <div
            data-testid="writers-section"
            className="bg-gray-50 p-5 rounded-xl border border-gray-100"
          >
            <h3 className="font-bold text-gray-800 border-b-2 border-blue-200 pb-2 mb-3 inline-block">
              ライター
            </h3>
            {editors.length > 0 && (
              <div className="mb-3">
                <span className="inline-block text-xs font-bold text-white bg-blue-500 px-2 py-0.5 rounded-full mb-2">
                  編集長
                </span>
                <ul className="text-sm text-gray-700 font-bold pl-1 space-y-1">
                  {editors.map((m) => (
                    <li key={`editor-${m.id}`}>
                      <button
                        type="button"
                        onClick={() => navigate("profile", m.username || m.id)}
                        className="hover:text-blue-600 hover:underline transition-colors text-left"
                      >
                        {formatMemberName(m)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {writersList.length > 0 && (
              <div>
                <span className="inline-block text-xs font-bold text-white bg-gray-400 px-2 py-0.5 rounded-full mb-2">
                  ライター
                </span>
                <ul className="text-sm text-gray-600 space-y-1 pl-1">
                  {writersList.map((m) => (
                    <li key={`writer-${m.id}`}>
                      <button
                        type="button"
                        onClick={() => navigate("profile", m.username || m.id)}
                        className="hover:text-blue-600 hover:underline transition-colors text-left"
                      >
                        {formatMemberName(m)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate("writers")}
              className="mt-3 text-sm text-blue-500 font-bold underline hover:text-blue-700 block"
            >
              ＞ 編集者一覧へ
            </button>
          </div>
        )}

        {/* エンジニアセクション */}
        {engineers.length > 0 && (
          <div
            data-testid="engineers-section"
            className="bg-gray-50 p-5 rounded-xl border border-gray-100"
          >
            <h3 className="font-bold text-gray-800 border-b-2 border-blue-200 pb-2 mb-3 inline-block">
              エンジニア
            </h3>
            <ul className="text-sm text-gray-600 space-y-1">
              {engineers.map((m) => (
                <li key={`engineer-${m.id}`}>
                  <button
                    type="button"
                    onClick={() => navigate("profile", m.username || m.id)}
                    className="hover:text-blue-600 hover:underline transition-colors text-left"
                  >
                    ・{formatMemberName(m)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* その他ロールの動的セクション */}
        {otherRoleGroups.map(({ role, label, members }) => (
          <div
            key={role}
            data-testid={`role-section-${role}`}
            className="bg-gray-50 p-5 rounded-xl border border-gray-100"
          >
            <h3 className="font-bold text-gray-800 border-b-2 border-blue-200 pb-2 mb-3 inline-block">
              {label}
            </h3>
            <ul className="text-sm text-gray-600 space-y-1">
              {members.map((m) => (
                <li key={`${role}-${m.id}`}>
                  <button
                    type="button"
                    onClick={() => navigate("profile", m.username || m.id)}
                    className="hover:text-blue-600 hover:underline transition-colors text-left"
                  >
                    ・{formatMemberName(m)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* メンバーが0件の場合のフォールバック */}
        {!teamMembersLoading && !hasAnyMembers && (
          <div
            data-testid="no-members-fallback"
            className="bg-gray-50 p-5 rounded-xl border border-gray-100 text-center py-6"
          >
            <p className="text-sm text-gray-500">
              メンバー情報を読み込み中、または登録されていません
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => navigate("home")}
          className="w-full py-3 bg-gray-100 font-bold rounded-xl text-gray-600 hover:bg-gray-200 cursor-pointer transition-colors"
        >
          ホームへ戻る
        </button>
      </div>
    </div>
  );
};
