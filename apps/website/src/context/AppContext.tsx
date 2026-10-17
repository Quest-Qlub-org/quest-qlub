import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "../supabase";
import type { Article, Series } from "../types";
import { AuthProvider, useAuth } from "./AuthContext";
import { UIProvider, useUI } from "./UIContext";
import { DataProvider, useData } from "./DataContext";

export { AuthProvider, useAuth } from "./AuthContext";
export { UIProvider, useUI } from "./UIContext";
export { DataProvider, useData } from "./DataContext";

export interface AppContextType {
  // Authentication & Profile
  user: User | null;
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
  userRole: "guest" | "viewer" | "writer" | "editor";
  setUserRole: React.Dispatch<React.SetStateAction<"guest" | "viewer" | "writer" | "editor">>;
  authLoading: boolean;

  // Global UI helpers
  showToast: (message: string) => void;
  navigate: (view: string, param?: string | null) => void;
  currentView: string;
  viewParam: string | null;

  // Core Data
  writers: Profile[];
  setWriters: React.Dispatch<React.SetStateAction<Profile[]>>;
  writersLoading: boolean;
  hasMoreWriters: boolean;
  loadingMoreWriters: boolean;
  loadMoreWriters: () => Promise<void>;
  articles: Article[];
  setArticles: React.Dispatch<React.SetStateAction<Article[]>>;
  articlesLoading: boolean;
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

    showToast: ui.showToast,
    navigate,
    currentView: location.pathname,
    viewParam: null,

    writers: data.writers,
    setWriters: data.setWriters,
    writersLoading: data.writersLoading,
    hasMoreWriters: data.hasMoreWriters,
    loadingMoreWriters: data.loadingMoreWriters,
    loadMoreWriters: data.loadMoreWriters,

    articles: data.articles,
    setArticles: data.setArticles,
    articlesLoading: data.articlesLoading,
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

    dataLoaded: data.dataLoaded,
  };
}
