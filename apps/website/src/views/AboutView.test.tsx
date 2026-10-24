// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { act } from "react";
import { AboutView } from "./AboutView";
import { renderWithRouter, createTestProfile } from "../test/test-utils";
import type { Profile } from "../supabase";

const mockNavigate = vi.fn();
const mockRefreshTeamMembers = vi.fn();
let mockTeamMembers: Profile[] = [];
let mockTeamMembersLoading = false;

vi.mock("../context/AppContext", () => ({
  useApp: () => ({
    navigate: mockNavigate,
    teamMembers: mockTeamMembers,
    teamMembersLoading: mockTeamMembersLoading,
    refreshTeamMembers: mockRefreshTeamMembers,
  }),
}));

describe("AboutView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockTeamMembers = [];
    mockTeamMembersLoading = false;
  });

  it("calls refreshTeamMembers on mount", () => {
    const { unmount } = renderWithRouter(<AboutView />);
    expect(mockRefreshTeamMembers).toHaveBeenCalled();
    unmount();
  });

  it("auto-refreshes teamMembers on window focus and quest_qlub_roles_updated event", () => {
    const { unmount } = renderWithRouter(<AboutView />);
    mockRefreshTeamMembers.mockClear();

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(mockRefreshTeamMembers).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event("quest_qlub_roles_updated"));
    });
    expect(mockRefreshTeamMembers).toHaveBeenCalledTimes(2);

    unmount();
  });

  it("enriches fallback engineer roles for Noimzip and るーと when DB roles column is not yet applied", () => {
    mockTeamMembers = [
      createTestProfile({
        id: "usr-noimzip-fallback",
        display_name: "Noimzip",
        username: "noimzip",
        role: "editor",
        roles: undefined,
      }),
      createTestProfile({
        id: "usr-root-fallback",
        display_name: "るーと　-Root-",
        username: "root",
        role: "writer",
        roles: undefined,
      }),
    ];

    const { container, unmount } = renderWithRouter(<AboutView />);

    const engineerSection = container.querySelector('[data-testid="engineers-section"]');
    expect(engineerSection).not.toBeNull();
    expect(engineerSection?.textContent).toContain("Noimzip");
    expect(engineerSection?.textContent).toContain("るーと　-Root-");

    const writersSection = container.querySelector('[data-testid="writers-section"]');
    expect(writersSection).not.toBeNull();
    expect(writersSection?.textContent).toContain("Noimzip");
    expect(writersSection?.textContent).toContain("るーと　-Root-");

    unmount();
  });

  it("displays static brand info and activity descriptions", () => {
    const { container, unmount } = renderWithRouter(<AboutView />);
    expect(container.textContent).toContain("Quest Qlub とは");
    expect(container.textContent).toContain("主な活動");
    expect(container.textContent).toContain("学びの『楽しい！』をつなげる");
    unmount();
  });

  it("dynamically categorizes and renders members by role", () => {
    mockTeamMembers = [
      createTestProfile({
        id: "usr-editor",
        display_name: "東雲　-Shinonome-",
        username: "shinonome",
        role: "editor",
        roles: ["editor"],
      }),
      createTestProfile({
        id: "usr-writer",
        display_name: "天羽 楽　-TENBA Gaku-",
        username: "gaku",
        role: "writer",
        roles: ["writer"],
      }),
      createTestProfile({
        id: "usr-root",
        display_name: "るーと　-Root-",
        username: "root",
        role: "writer",
        roles: ["writer", "engineer"], // 複数ロール所持
      }),
      createTestProfile({
        id: "usr-noimzip",
        display_name: "Noimzip",
        username: "noimzip",
        role: "viewer",
        roles: ["engineer"],
      }),
    ];

    const { container, unmount } = renderWithRouter(<AboutView />);

    // 編集長
    expect(container.textContent).toContain("東雲　-Shinonome-");

    // ライター
    expect(container.textContent).toContain("天羽 楽　-TENBA Gaku-");
    expect(container.textContent).toContain("るーと　-Root-");

    // エンジニア
    expect(container.textContent).toContain("Noimzip");

    // 複数ロール「るーと」がライターとエンジニアの両方に反映されていることの検証
    const engineerSection = container.querySelector('[data-testid="engineers-section"]');
    expect(engineerSection).not.toBeNull();
    expect(engineerSection?.textContent).toContain("るーと　-Root-");
    expect(engineerSection?.textContent).toContain("Noimzip");

    const writersSection = container.querySelector('[data-testid="writers-section"]');
    expect(writersSection).not.toBeNull();
    expect(writersSection?.textContent).toContain("るーと　-Root-");
    expect(writersSection?.textContent).toContain("天羽 楽　-TENBA Gaku-");
    expect(writersSection?.textContent).toContain("東雲　-Shinonome-");

    unmount();
  });

  it("handles backwards compatibility when roles array is missing (fallback to role)", () => {
    mockTeamMembers = [
      createTestProfile({
        id: "usr-legacy-editor",
        display_name: "旧エディター",
        username: "legacy_editor",
        role: "editor",
        roles: undefined, // 旧スキーマ
      }),
      createTestProfile({
        id: "usr-legacy-writer",
        display_name: "旧ライター",
        username: "legacy_writer",
        role: "writer",
        roles: undefined,
      }),
    ];

    const { container, unmount } = renderWithRouter(<AboutView />);

    expect(container.textContent).toContain("旧エディター");
    expect(container.textContent).toContain("旧ライター");

    unmount();
  });

  it("supports custom staff roles dynamically", () => {
    mockTeamMembers = [
      createTestProfile({
        id: "usr-designer",
        display_name: "デザイン担当者",
        username: "designer1",
        role: "viewer",
        roles: ["designer"],
      }),
    ];

    const { container, unmount } = renderWithRouter(<AboutView />);

    const designerSection = container.querySelector('[data-testid="role-section-designer"]');
    expect(designerSection).not.toBeNull();
    expect(designerSection?.textContent).toContain("デザイン担当者");

    unmount();
  });

  it("renders loading skeleton while teamMembersLoading is true and list is empty", () => {
    mockTeamMembersLoading = true;
    mockTeamMembers = [];

    const { container, unmount } = renderWithRouter(<AboutView />);

    const skeleton = container.querySelector('[data-testid="members-loading-skeleton"]');
    expect(skeleton).not.toBeNull();

    unmount();
  });

  it("renders empty fallback when not loading and no staff members exist", () => {
    mockTeamMembersLoading = false;
    mockTeamMembers = [];

    const { container, unmount } = renderWithRouter(<AboutView />);

    const fallback = container.querySelector('[data-testid="no-members-fallback"]');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain("メンバー情報を読み込み中、または登録されていません");

    unmount();
  });

  it("navigates to member profile when clicking member name", () => {
    mockTeamMembers = [
      createTestProfile({
        id: "usr-1",
        display_name: "テスト花子",
        username: "hanako",
        role: "writer",
        roles: ["writer"],
      }),
    ];

    const { container, unmount } = renderWithRouter(<AboutView />);

    const memberBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("テスト花子"),
    );
    expect(memberBtn).toBeDefined();

    act(() => {
      memberBtn?.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("profile", "hanako");

    unmount();
  });

  it("navigates to writers list when clicking '＞ 編集者一覧へ'", () => {
    mockTeamMembers = [
      createTestProfile({
        id: "usr-1",
        display_name: "テスト太郎",
        username: "taro",
        role: "writer",
        roles: ["writer"],
      }),
    ];

    const { container, unmount } = renderWithRouter(<AboutView />);

    const writersListBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("＞ 編集者一覧へ"),
    );
    expect(writersListBtn).toBeDefined();

    act(() => {
      writersListBtn?.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("writers");

    unmount();
  });

  it("navigates to home when clicking 'ホームへ戻る'", () => {
    const { container, unmount } = renderWithRouter(<AboutView />);

    const homeBtn = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("ホームへ戻る"),
    );
    expect(homeBtn).toBeDefined();

    act(() => {
      homeBtn?.click();
    });

    expect(mockNavigate).toHaveBeenCalledWith("home");

    unmount();
  });

  it("does not duplicate editor in the writers section when holding both editor and writer roles", () => {
    mockTeamMembers = [
      createTestProfile({
        id: "usr-dual-editor",
        display_name: "東雲",
        username: "shinonome",
        role: "editor",
        roles: ["editor", "writer"], // 編集長かつライター
      }),
      createTestProfile({
        id: "usr-pure-writer",
        display_name: "天羽 楽",
        username: "gaku",
        role: "writer",
        roles: ["writer"],
      }),
    ];

    const { container, unmount } = renderWithRouter(<AboutView />);

    const writersSection = container.querySelector('[data-testid="writers-section"]');
    expect(writersSection).not.toBeNull();

    // 編集長枠には東雲が表示される
    expect(writersSection?.textContent).toContain("東雲");

    // 同一セクション内で「東雲」が2回重複して出現しないことを検証
    const nameMatches = writersSection?.textContent?.match(/東雲/g) || [];
    expect(nameMatches.length).toBe(1);

    // ライター枠には純粋なライター「天羽 楽」が表示される
    expect(writersSection?.textContent).toContain("天羽 楽");

    unmount();
  });

  it("does not render ghost sections for empty or whitespace role strings", () => {
    mockTeamMembers = [
      createTestProfile({
        id: "usr-empty-role",
        display_name: "テストユーザー",
        username: "user_empty",
        role: "viewer",
        roles: ["", "   "],
      }),
    ];

    const { container, unmount } = renderWithRouter(<AboutView />);

    // 空白ロール用セクションが一切描画されないこと
    const ghostSection = container.querySelector('[data-testid^="role-section-"]');
    expect(ghostSection).toBeNull();

    unmount();
  });
});
