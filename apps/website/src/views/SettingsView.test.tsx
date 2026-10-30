// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { SettingsView } from "./SettingsView";
import * as AppContextModule from "../context/AppContext";
import { supabase } from "../supabase";
import { renderWithRouter, createTestProfile } from "../test/test-utils";

describe("SettingsView integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupAppMock(overrides: Partial<ReturnType<typeof AppContextModule.useApp>> = {}) {
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      profile: createTestProfile(),
      setProfile: vi.fn(),
      userRole: "writer",
      setWriters: vi.fn(),
      showToast: vi.fn(),
      fontSize: "medium",
      setFontSize: vi.fn(),
      theme: "light",
      setTheme: vi.fn(),
      authLoading: false,
      ...overrides,
    } as unknown as ReturnType<typeof AppContextModule.useApp>);
  }

  it("renders PWA installation section for logged-in users", () => {
    setupAppMock();

    const { container, unmount } = renderWithRouter(<SettingsView />);

    expect(container.querySelector('[data-testid="pwa-install-settings-section"]')).not.toBeNull();
    expect(container.textContent).toContain("アプリ（PWA）のインストール");

    unmount();
  });

  it("renders PWA installation section for guest users", () => {
    setupAppMock({
      profile: null,
      userRole: "guest",
    });

    const { container, unmount } = renderWithRouter(<SettingsView />);

    expect(container.querySelector('[data-testid="pwa-install-settings-section"]')).not.toBeNull();
    expect(container.textContent).toContain("ログインしていません");
    expect(container.textContent).toContain("アプリ（PWA）のインストール");

    unmount();
  });

  it("hides PWA installation section when dismissed in SettingsView and allows restoring", () => {
    localStorage.setItem("quest_qlub_pwa_install_dismissed", "true");
    setupAppMock();

    const { container, unmount } = renderWithRouter(<SettingsView />);

    expect(container.querySelector('[data-testid="pwa-install-settings-section"]')).toBeNull();
    const restoreBtn = container.querySelector(
      '[data-testid="pwa-restore-button"]',
    ) as HTMLButtonElement;
    expect(restoreBtn).not.toBeNull();

    unmount();
  });

  it("shows error toast when display name update fails", async () => {
    const mockShowToast = vi.fn();
    setupAppMock({
      showToast: mockShowToast,
      profile: createTestProfile({ id: "user-1", display_name: "旧表示名" }),
    });

    vi.spyOn(supabase, "from").mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: "Permission denied" } }),
      }),
    } as any);

    const { container, unmount } = renderWithRouter(<SettingsView />);

    // 表示名の「編集」ボタンをクリック
    const changeButtons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent?.trim() === "編集",
    );
    expect(changeButtons.length).toBeGreaterThan(0);

    await act(async () => {
      changeButtons[0].click();
    });

    // 「保存」ボタンをクリック
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "保存",
    );
    expect(saveButton).toBeDefined();

    await act(async () => {
      saveButton!.click();
    });

    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining("表示名の更新に失敗しました: Permission denied"),
    );

    unmount();
  });
});
