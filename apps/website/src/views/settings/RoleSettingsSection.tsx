import { useNavigate } from "react-router-dom";
import { Shield, PenTool, Code } from "lucide-react";
import type { Profile } from "../../supabase";
import {
  getProfileRoles,
  profileHasRole,
  getRoleLabel,
  getRoleBadgeClass,
} from "../../utils/roles";

export function RoleSettingsSection({ profile }: { profile: Profile | null }) {
  const navigate = useNavigate();
  const roles = getProfileRoles(profile);
  const isEditor = profileHasRole(profile, "editor");
  const isWriter = profileHasRole(profile, "writer");
  const isOnlyViewer = roles.length === 0 || (roles.length === 1 && roles[0] === "viewer");

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="p-4 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm">
            アカウント種別・権限
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            現在の利用権限とアクセス可能な画面です
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {roles.map((r) => (
            <span
              key={r}
              className={`px-2.5 py-1 text-xs font-bold rounded-full ${getRoleBadgeClass(r)}`}
            >
              {getRoleLabel(r)}
            </span>
          ))}
        </div>
      </div>
      <div className="p-4 space-y-3">
        {isEditor && (
          <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-800/50">
            <div className="flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <div>
                <p className="text-xs font-bold text-purple-900 dark:text-purple-200">
                  編集長ダッシュボード
                </p>
                <p className="text-[11px] text-purple-700 dark:text-purple-300">
                  記事管理・推薦設定・ライター管理
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/editor-dash")}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              管理画面へ
            </button>
          </div>
        )}

        {(isWriter || isEditor) && (
          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-800/50">
            <div className="flex items-center gap-2.5">
              <PenTool className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  ライターダッシュボード
                </p>
                <p className="text-[11px] text-blue-700 dark:text-blue-300">
                  記事の執筆・編集・シリーズ管理
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/writer-dash")}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              執筆画面へ
            </button>
          </div>
        )}

        {profileHasRole(profile, "engineer") && (
          <div
            data-testid="engineer-role-card"
            className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-800/50"
          >
            <div className="flex items-center gap-2.5">
              <Code className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  エンジニア権限
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                  システム開発・保守・技術支援
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate("/about")}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              Aboutページへ
            </button>
          </div>
        )}

        {isOnlyViewer && (
          <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300 flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-800 dark:text-gray-200">一般読者アカウント</p>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                記事の閲覧やお気に入り登録をご利用いただけます
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/contact")}
              className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              ライターに応募
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
