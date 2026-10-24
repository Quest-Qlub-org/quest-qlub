import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "../supabase";
import type { Article, Series } from "../types";
import { AuthProvider, useAuth } from "./AuthContext";
import type { UserRole } from "./AuthContext";
import { UIProvider, useUI } from "./UIContext";
import type { ThemeMode } from "./UIContext";
import { DataProvider, useData } from "./DataContext";

export { AuthProvider, useAuth } from "./AuthContext";
export { UIProvider, useUI } from "./UIContext";
export type { ThemeMode } from "./UIContext";
export { DataProvider, useData } from "./DataContext";

export interface AppContextType {
  // Authentication & Profile
  user: User | null;
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  userRole: UserRole;
  setUserRole: React.Dispatch<React.SetStateAction<UserRole>>;
  authLoading: boolean;
  mfaChallengeRequired: boolean;
  setMfaChallengeRequired: React.Dispatch<React.SetStateAction<boolean>>;
  refreshProfile: () => Promise<void>;

  // Global UI helpers
  showToast: (message: string) => void;
  navigate: (view: string, param?: string | null) => void;
  currentView: string;
  viewParam: string | null;

  // Core Data
  writers: Profile[];
  setWriters: React.Dispatch<React.SetStateAction<Profile[]>>;
  writersLoading: boolean;
  refreshWriters: () => Promise<void>;
  hasMoreWriters: boolean;
  loadingMoreWriters: boolean;
  loadMoreWriters: () => Promise<void>;
  teamMembers: Profile[];
  setTeamMembers: React.Dispatch<React.SetStateAction<Profile[]>>;
  teamMembersLoading: boolean;
  refreshTeamMembers: () => Promise<void>;
  articles: Article[];
  setArticles: React.Dispatch<React.SetStateAction<Article[]>>;
  articlesLoading: boolean;
  refreshArticles: () => Promise<void>;
  hasMoreArticles: boolean;
  loadingMoreArticles: boolean;
  loadMoreArticles: () => Promise<void>;
  seriesList: Series[];
  setSeriesList: React.Dispatch<React.SetStateAction<Series[]>>;

  // Favorites
  favorites: string[];
  setFavorites: React.Dispatch<React.SetStateAction<string[]>>;
  toggleFavorite: (articleId: string) => Promise<void> | void;

  // Font Settings
  fontSize: string;
  setFontSize: React.Dispatch<React.SetStateAction<string>>;
  getFontSizeClass: () => string;

  // Theme Settings
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  effectiveTheme: "light" | "dark";
  toggleTheme: () => void;

  // Loading states
  dataLoaded: boolean;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UIProvider>
        <DataProvider>{children}</DataProvider>
      </UIProvider>
    </AuthProvider>
  );
}

// 従来の navigate("viewName", param) を React Router のパスへ変換するマッピング
const VIEW_TO_PATH_MAP: Record<string, (param?: string | null) => string> = {
  home: () => "/",
  search: () => "/search",
  settings: () => "/settings",
  writers: () => "/writers",
  profile: (p) => (p ? `/writers/${p}` : "/writers"),
  favorites: () => "/favorites",
  about: () => "/about",
  privacy: () => "/privacy",
  terms: () => "/terms",
  contact: () => "/contact",
  writerDash: () => "/writer-dash",
  writerNew: () => "/writer-dash/new",
  writerEdit: (p) => (p ? `/writer-dash/edit/${p}` : "/writer-dash/new"),
  writerSeries: () => "/writer-dash/series",
  editorDash: () => "/editor-dash",
  editorArticles: () => "/editor-dash/articles",
  editorRecommend: () => "/editor-dash/recommend",
  editorWriters: () => "/editor-dash/writers",
  editorApplications: () => "/editor-dash/applications",
  login: () => "/login",
  register: () => "/register",
  forgotPassword: () => "/forgot-password",
  resetPassword: () => "/reset-password",
  article: (p) => (p ? `/articles/${p}` : "/"),
};

export function useApp(): AppContextType {
  const auth = useAuth();
  const ui = useUI();
  const data = useData();
  const routerNavigate = useNavigate();
  const location = useLocation();

  const navigate = (view: string, param?: string | null) => {
    if (view.startsWith("/")) {
      void routerNavigate(view);
      return;
    }
    const mapper = VIEW_TO_PATH_MAP[view];
    if (mapper) {
      void routerNavigate(mapper(param));
    } else {
      void routerNavigate(`/${view}`);
    }
  };

  return {
    user: auth.user,
    profile: auth.profile,
    setProfile: auth.setProfile,
    userRole: auth.userRole,
    setUserRole: auth.setUserRole,
    authLoading: auth.authLoading,
    mfaChallengeRequired: auth.mfaChallengeRequired,
    setMfaChallengeRequired: auth.setMfaChallengeRequired,
    refreshProfile: auth.refreshProfile,

    showToast: ui.showToast,
    navigate,
    currentView: location.pathname,
    viewParam: null,

    writers: data.writers,
    setWriters: data.setWriters,
    writersLoading: data.writersLoading,
    refreshWriters: data.refreshWriters,
    hasMoreWriters: data.hasMoreWriters,
    loadingMoreWriters: data.loadingMoreWriters,
    loadMoreWriters: data.loadMoreWriters,
    teamMembers: data.teamMembers,
    setTeamMembers: data.setTeamMembers,
    teamMembersLoading: data.teamMembersLoading,
    refreshTeamMembers: data.refreshTeamMembers,

    articles: data.articles,
    setArticles: data.setArticles,
    articlesLoading: data.articlesLoading,
    refreshArticles: data.refreshArticles,
    hasMoreArticles: data.hasMoreArticles,
    loadingMoreArticles: data.loadingMoreArticles,
    loadMoreArticles: data.loadMoreArticles,

    seriesList: data.seriesList,
    setSeriesList: data.setSeriesList,

    favorites: data.favorites,
    setFavorites: data.setFavorites,
    toggleFavorite: data.toggleFavorite,

    fontSize: ui.fontSize,
    setFontSize: ui.setFontSize,
    getFontSizeClass: ui.getFontSizeClass,

    theme: ui.theme,
    setTheme: ui.setTheme,
    effectiveTheme: ui.effectiveTheme,
    toggleTheme: ui.toggleTheme,

    dataLoaded: data.dataLoaded,
  };
}
