import { lazy, useEffect } from "react";
import { Routes, Route, useParams, useNavigate } from "react-router-dom";
import { AppProviders } from "./context/AppContext";
import { AppLayout } from "./components/layout/AppLayout";
import { RoleRoute, SudoAreaLayout } from "./components/RoleRoute";
import { updateMetaTags } from "./utils/seo";

// Views: 初期表示速度のためトップビューは同期インポート
import { HomeView } from "./views/HomeView";

// 遅延読み込みコンポーネント (Code Splitting)
const ArticleView = lazy(() =>
  import("./views/ArticleView").then((m) => ({ default: m.ArticleView })),
);
const SearchView = lazy(() =>
  import("./views/SearchView").then((m) => ({ default: m.SearchView })),
);
const WritersView = lazy(() =>
  import("./views/WritersView").then((m) => ({ default: m.WritersView })),
);
const ProfileView = lazy(() =>
  import("./views/ProfileView").then((m) => ({ default: m.ProfileView })),
);
const FavoritesView = lazy(() =>
  import("./views/FavoritesView").then((m) => ({ default: m.FavoritesView })),
);
const SettingsView = lazy(() =>
  import("./views/SettingsView").then((m) => ({ default: m.SettingsView })),
);
const AboutView = lazy(() => import("./views/AboutView").then((m) => ({ default: m.AboutView })));
const PrivacyView = lazy(() =>
  import("./views/PrivacyView").then((m) => ({ default: m.PrivacyView })),
);
const TermsView = lazy(() => import("./views/TermsView").then((m) => ({ default: m.TermsView })));
const ContactView = lazy(() =>
  import("./views/ContactView").then((m) => ({ default: m.ContactView })),
);
const WriterApplyView = lazy(() =>
  import("./views/WriterApplyView").then((m) => ({ default: m.WriterApplyView })),
);
import { OfflineFallbackView } from "./views/OfflineFallbackView";
import { useNetworkStatus } from "./hooks/useNetworkStatus";

// 認証関連ビュー
const LoginView = lazy(() =>
  import("./views/auth/LoginView").then((m) => ({ default: m.LoginView })),
);
const RegisterView = lazy(() =>
  import("./views/auth/RegisterView").then((m) => ({ default: m.RegisterView })),
);
const ForgotPasswordView = lazy(() =>
  import("./views/auth/ForgotPasswordView").then((m) => ({ default: m.ForgotPasswordView })),
);
const ResetPasswordView = lazy(() =>
  import("./views/auth/ResetPasswordView").then((m) => ({ default: m.ResetPasswordView })),
);
const SetupProfileView = lazy(() =>
  import("./views/auth/SetupProfileView").then((m) => ({ default: m.SetupProfileView })),
);

// ダッシュボード・エディタ関連ビュー (TipTap等の重量級チャンクを分離)
const WriterDashboard = lazy(() =>
  import("./views/dashboard/WriterDashboard").then((m) => ({ default: m.WriterDashboard })),
);
const WriterSeriesPage = lazy(() =>
  import("./views/dashboard/WriterSeriesPage").then((m) => ({ default: m.WriterSeriesPage })),
);
const ArticleEditorPage = lazy(() =>
  import("./views/dashboard/ArticleEditorView").then((m) => ({ default: m.ArticleEditorPage })),
);
const EditorDashboard = lazy(() =>
  import("./views/dashboard/EditorDashboard").then((m) => ({ default: m.EditorDashboard })),
);
const EditorArticlesView = lazy(() =>
  import("./views/dashboard/EditorArticlesView").then((m) => ({ default: m.EditorArticlesView })),
);
const EditorRecommendView = lazy(() =>
  import("./views/dashboard/EditorRecommendView").then((m) => ({ default: m.EditorRecommendView })),
);
const EditorWritersView = lazy(() =>
  import("./views/dashboard/EditorWritersView").then((m) => ({ default: m.EditorWritersView })),
);
const EditorApplicationsView = lazy(() =>
  import("./views/dashboard/EditorApplicationsView").then((m) => ({
    default: m.EditorApplicationsView,
  })),
);

// Types & Utilities export for backward compatibility & tests
export type { Series, Article } from "./types";
export { THUMBNAIL_COLORS, getThumbnailColor, MOCK_TAGS } from "./types";
export {
  LogoIcon,
  CustomHomeIcon,
  CustomSearchIcon,
  CustomUserIcon,
  CustomStarIcon,
  CustomSettingsIcon,
} from "./components/icons/NavIcons";

function ArticleEditWrapper() {
  const { id } = useParams<{ id: string }>();
  return <ArticleEditorPage editingId={id || null} />;
}

export function NotFoundView() {
  const { isOnline } = useNetworkStatus();
  const navigate = useNavigate();

  useEffect(() => {
    updateMetaTags({
      title: "ページが見つかりません",
      noindex: true,
    });
  }, []);

  if (!isOnline) {
    return <OfflineFallbackView />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center animate-in fade-in duration-300">
      <p className="text-8xl font-black text-gray-200 dark:text-gray-800 select-none mb-2">404</p>
      <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-3">
        ページが見つかりません
      </h1>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-8 max-w-xs">
        指定されたURLのページは存在しないか、移動した可能性があります。
      </p>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="px-6 py-3 bg-gray-900 hover:bg-gray-700 dark:bg-gray-100 dark:hover:bg-gray-200 text-white dark:text-gray-900 text-sm font-bold rounded-xl transition-colors shadow-sm"
      >
        トップへ戻る
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AppProviders>
      <Routes>
        <Route element={<AppLayout />}>
          {/* Public Views */}
          <Route path="/" element={<HomeView />} />
          <Route path="/search" element={<SearchView />} />
          <Route path="/writers" element={<WritersView />} />
          <Route path="/writers/:username" element={<ProfileView />} />
          <Route path="/articles/:id" element={<ArticleView />} />
          <Route path="/favorites" element={<FavoritesView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/about" element={<AboutView />} />
          <Route path="/privacy" element={<PrivacyView />} />
          <Route path="/terms" element={<TermsView />} />
          <Route path="/contact" element={<ContactView />} />
          <Route path="/offline" element={<OfflineFallbackView />} />
          <Route path="/writer-apply" element={<WriterApplyView />} />

          {/* Auth Views */}

          <Route path="/login" element={<LoginView />} />
          <Route path="/register" element={<RegisterView />} />
          <Route path="/forgot-password" element={<ForgotPasswordView />} />
          <Route path="/reset-password" element={<ResetPasswordView />} />
          <Route path="/setup-profile" element={<SetupProfileView />} />

          {/* Protected Dashboard Views (Shared SudoAreaLayout preserves Sudo between writer and editor dashboards) */}
          <Route element={<SudoAreaLayout />}>
            <Route element={<RoleRoute requiredRole="writer" manageLeaveLock={false} />}>
              <Route path="/writer-dash" element={<WriterDashboard />} />
              <Route path="/writer-dash/new" element={<ArticleEditorPage editingId={null} />} />
              <Route path="/writer-dash/edit/:id" element={<ArticleEditWrapper />} />
              <Route path="/writer-dash/series" element={<WriterSeriesPage />} />
            </Route>

            <Route element={<RoleRoute requiredRole="editor" manageLeaveLock={false} />}>
              <Route path="/editor-dash" element={<EditorDashboard />} />
              <Route path="/editor-dash/articles" element={<EditorArticlesView />} />
              <Route path="/editor-dash/recommend" element={<EditorRecommendView />} />
              <Route path="/editor-dash/writers" element={<EditorWritersView />} />
              <Route path="/editor-dash/applications" element={<EditorApplicationsView />} />
            </Route>
          </Route>

          {/* 404 Fallback */}
          <Route path="*" element={<NotFoundView />} />
        </Route>
      </Routes>
    </AppProviders>
  );
}
