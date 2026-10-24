// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useApp } from "./AppContext";
import * as AuthContextModule from "./AuthContext";
import * as DataContextModule from "./DataContext";
import * as UIContextModule from "./UIContext";
import { createTestArticle, createTestProfile } from "../test/test-utils";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AppContext - useApp hook", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it("aggregates auth, data, ui contexts and provides routing navigate helper", () => {
    const mockProfile = createTestProfile();
    const mockArticle = createTestArticle();

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: null,
      profile: mockProfile,
      setProfile: vi.fn(),
      userRole: "writer",
      setUserRole: vi.fn(),
      authLoading: false,
      mfaChallengeRequired: false,
      setMfaChallengeRequired: vi.fn(),
      refreshProfile: vi.fn(),
    });

    vi.spyOn(DataContextModule, "useData").mockReturnValue({
      articles: [mockArticle],
      setArticles: vi.fn(),
      articlesLoading: false,
      refreshArticles: vi.fn(),
      hasMoreArticles: false,
      loadingMoreArticles: false,
      loadMoreArticles: vi.fn(),
      writers: [mockProfile],
      setWriters: vi.fn(),
      writersLoading: false,
      refreshWriters: vi.fn(),
      hasMoreWriters: false,
      loadingMoreWriters: false,
      loadMoreWriters: vi.fn(),
      teamMembers: [mockProfile],
      setTeamMembers: vi.fn(),
      teamMembersLoading: false,
      refreshTeamMembers: vi.fn(),
      seriesList: [],
      setSeriesList: vi.fn(),
      favorites: [mockArticle.id],
      setFavorites: vi.fn(),
      favoritesLoading: false,
      toggleFavorite: vi.fn(),
      dataLoaded: true,
    });

    vi.spyOn(UIContextModule, "useUI").mockReturnValue({
      toastMessage: "",
      showToast: vi.fn(),
      hideToast: vi.fn(),
      fontSize: "medium",
      setFontSize: vi.fn(),
      getFontSizeClass: () => "text-base leading-relaxed",
      theme: "system",
      setTheme: vi.fn(),
      effectiveTheme: "light",
      toggleTheme: vi.fn(),
    });

    let appState!: ReturnType<typeof useApp>;
    let currentPath = "";

    const TestConsumer = () => {
      appState = useApp();
      const location = useLocation();
      currentPath = location.pathname;
      return (
        <div>
          <button onClick={() => appState.navigate("search")}>Go Search</button>
          <button onClick={() => appState.navigate("article", "art-999")}>Go Article</button>
          <button onClick={() => appState.navigate("profile", "writer-abc")}>Go Profile</button>
          <button onClick={() => appState.navigate("/custom-url")}>Go Direct</button>
        </div>
      );
    };

    act(() => {
      root!.render(
        <MemoryRouter initialEntries={["/"]}>
          <TestConsumer />
        </MemoryRouter>,
      );
    });

    // 集約された値の検証
    expect(appState.userRole).toBe("writer");
    expect(appState.profile?.username).toBe("testwriter");
    expect(appState.articles.length).toBe(1);
    expect(appState.favorites).toContain(mockArticle.id);
    expect(currentPath).toBe("/");

    // 遷移ヘルパー (navigate) の検証: "search" -> "/search"
    act(() => {
      appState.navigate("search");
    });
    expect(currentPath).toBe("/search");

    // "article", "art-999" -> "/articles/art-999"
    act(() => {
      appState.navigate("article", "art-999");
    });
    expect(currentPath).toBe("/articles/art-999");

    // "profile", "writer-abc" -> "/writers/writer-abc"
    act(() => {
      appState.navigate("profile", "writer-abc");
    });
    expect(currentPath).toBe("/writers/writer-abc");

    // 直接パス指定: "/custom-url" -> "/custom-url"
    act(() => {
      appState.navigate("/custom-url");
    });
    expect(currentPath).toBe("/custom-url");
  });
});
