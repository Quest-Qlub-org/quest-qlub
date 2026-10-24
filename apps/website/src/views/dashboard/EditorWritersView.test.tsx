// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { act } from "react";
import { EditorWritersView } from "./EditorWritersView";
import { renderWithRouter, createTestProfile } from "../../test/test-utils";
import { supabase } from "../../supabase";

const mockShowToast = vi.fn();
const mockRefreshTeamMembers = vi.fn();

vi.mock("../../context/AppContext", () => ({
  useApp: () => ({
    showToast: mockShowToast,
    refreshTeamMembers: mockRefreshTeamMembers,
  }),
}));

describe("EditorWritersView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders profile list with multi-role badges and allows toggling roles", async () => {
    const mockProfiles = [
      createTestProfile({
        id: "usr-1",
        display_name: "るーと",
        username: "root",
        email: "root@example.com",
        role: "writer",
        roles: ["writer"],
      }),
    ];

    const rpcSpy = vi.spyOn(supabase, "rpc").mockImplementation(((fn: string, _args?: any) => {
      if (fn === "admin_get_all_profiles") {
        return Promise.resolve({ data: mockProfiles, error: null });
      }
      if (fn === "admin_set_user_roles") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }) as any);

    let renderResult!: ReturnType<typeof renderWithRouter>;
    await act(async () => {
      renderResult = renderWithRouter(<EditorWritersView />);
    });
    const { container, unmount } = renderResult;

    // 名前とロールが表示されていること
    expect(container.textContent).toContain("るーと");
    expect(container.textContent).toContain("ライター");

    // 「+ エンジニア」ボタンをクリックしてロールを追加トグル
    const engineerToggleBtn = Array.from(container.querySelectorAll("button")).find(
      (btn: HTMLButtonElement) => btn.textContent?.includes("+ エンジニア"),
    );
    expect(engineerToggleBtn).toBeDefined();

    await act(async () => {
      engineerToggleBtn?.click();
    });

    // admin_set_user_roles が ['writer', 'engineer'] で呼ばれたことを検証
    expect(rpcSpy).toHaveBeenCalledWith("admin_set_user_roles", {
      target_user_id: "usr-1",
      new_roles: ["writer", "engineer"],
    });

    // トースト通知と refreshTeamMembers が呼ばれたことを検証
    expect(mockShowToast).toHaveBeenCalledWith("ロール（エンジニア）を更新しました");
    expect(mockRefreshTeamMembers).toHaveBeenCalled();

    unmount();
  });

  it("falls back to admin_change_user_role when admin_set_user_roles RPC is not yet in DB", async () => {
    const mockProfiles = [
      createTestProfile({
        id: "usr-2",
        display_name: "天羽 楽",
        username: "gaku",
        email: "gaku@example.com",
        role: "writer",
        roles: ["writer"],
      }),
    ];

    const rpcSpy = vi.spyOn(supabase, "rpc").mockImplementation(((fn: string, _args?: any) => {
      if (fn === "admin_get_all_profiles") {
        return Promise.resolve({ data: mockProfiles, error: null });
      }
      if (fn === "admin_set_user_roles") {
        // 関数未定義エラー（42883）
        return Promise.resolve({
          data: null,
          error: { code: "42883", message: "function admin_set_user_roles does not exist" },
        });
      }
      if (fn === "admin_change_user_role") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }) as any);

    let renderResult!: ReturnType<typeof renderWithRouter>;
    await act(async () => {
      renderResult = renderWithRouter(<EditorWritersView />);
    });
    const { container, unmount } = renderResult;

    const editorToggleBtn = Array.from(container.querySelectorAll("button")).find(
      (btn: HTMLButtonElement) => btn.textContent?.includes("+ 編集長"),
    );
    expect(editorToggleBtn).toBeDefined();

    await act(async () => {
      editorToggleBtn?.click();
    });

    // フォールバックで admin_change_user_role が実行されたことを検証
    expect(rpcSpy).toHaveBeenCalledWith("admin_change_user_role", {
      target_user_id: "usr-2",
      new_role: "editor",
    });

    unmount();
  });

  it("preserves engineer role when demoting from writer to viewer in dropdown", async () => {
    const mockProfiles = [
      createTestProfile({
        id: "usr-eng-writer",
        display_name: "るーと",
        username: "root",
        email: "root@example.com",
        role: "writer",
        roles: ["writer", "engineer"],
      }),
    ];

    const rpcSpy = vi.spyOn(supabase, "rpc").mockImplementation(((fn: string, _args?: any) => {
      if (fn === "admin_get_all_profiles") {
        return Promise.resolve({ data: mockProfiles, error: null });
      }
      if (fn === "admin_set_user_roles") {
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }) as any);

    let renderResult!: ReturnType<typeof renderWithRouter>;
    await act(async () => {
      renderResult = renderWithRouter(<EditorWritersView />);
    });
    const { container, unmount } = renderResult;

    // ドロップダウンを「viewer」に変更
    const select = container.querySelector(
      '[data-testid="role-select-usr-eng-writer"]',
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe("writer");

    await act(async () => {
      select.value = "viewer";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // engineer ロールが維持され、['engineer'] で admin_set_user_roles が呼ばれること
    expect(rpcSpy).toHaveBeenCalledWith("admin_set_user_roles", {
      target_user_id: "usr-eng-writer",
      new_roles: ["engineer"],
    });

    unmount();
  });

  it("filters profiles by role", async () => {
    const mockProfiles = [
      createTestProfile({
        id: "usr-eng",
        display_name: "Noimzip",
        username: "noimzip",
        role: "viewer",
        roles: ["engineer"],
      }),
      createTestProfile({
        id: "usr-editor",
        display_name: "東雲",
        username: "shinonome",
        role: "editor",
        roles: ["editor"],
      }),
    ];

    vi.spyOn(supabase, "rpc").mockImplementation(((fn: string) => {
      if (fn === "admin_get_all_profiles") {
        return Promise.resolve({ data: mockProfiles, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    }) as any);

    let renderResult!: ReturnType<typeof renderWithRouter>;
    await act(async () => {
      renderResult = renderWithRouter(<EditorWritersView />);
    });
    const { container, unmount } = renderResult;

    // 初期状態: 両名表示
    expect(container.textContent).toContain("Noimzip");
    expect(container.textContent).toContain("東雲");

    // フィルターセレクトを取得（絞り込み枠内）
    const roleFilterSelect = container.querySelectorAll("select")[0];
    expect(roleFilterSelect).not.toBeNull();

    await act(async () => {
      roleFilterSelect.value = "engineer";
      roleFilterSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // エンジニアのみ表示されること
    expect(container.textContent).toContain("Noimzip");
    expect(container.textContent).not.toContain("東雲");

    unmount();
  });
});
