// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ProfileSettingsSection } from "./ProfileSettingsSection";
import { renderWithRouter, createTestProfile } from "../../test/test-utils";
import * as useFollowsModule from "../../hooks/useFollows";
import { supabase } from "../../supabase";

describe("ProfileSettingsSection follow modal (#108, #112)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders follow modal user rows as Link elements and closes on Escape", async () => {
    const profile = createTestProfile({ id: "user-1", username: "me", display_name: "自分" });
    const followedUser = createTestProfile({
      id: "user-2",
      username: "target_writer",
      display_name: "対象ライター",
    });

    vi.spyOn(useFollowsModule, "fetchFollowCounts").mockResolvedValue({
      followingCount: 1,
      followersCount: 0,
    });
    vi.spyOn(useFollowsModule, "fetchFollowDetails").mockResolvedValue({
      allowed: true,
      following: [followedUser],
      followers: [],
    });

    const { unmount } = renderWithRouter(
      <ProfileSettingsSection profile={profile} setProfile={vi.fn()} showToast={vi.fn()} />,
    );

    const followingButton = await screen.findByRole("button", { name: /フォロー中/ });
    fireEvent.click(followingButton);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("follow-manage-modal-title");
    expect(screen.getByRole("button", { name: "閉じる" })).toBeTruthy();

    const userLink = await screen.findByRole("link", { name: /対象ライター/ });
    expect(userLink.getAttribute("href")).toBe("/writers/target_writer");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    unmount();
  });

  it("handles avatar DB update failure, rejects whitespace-only display name, and distinguishes username DB errors", async () => {
    const profile = createTestProfile({ id: "user-1", username: "me_1", display_name: "自分" });
    const mockSetProfile = vi.fn();
    const mockShowToast = vi.fn();

    vi.spyOn(useFollowsModule, "fetchFollowCounts").mockResolvedValue({
      followingCount: 0,
      followersCount: 0,
    });

    vi.spyOn(supabase.storage, "from").mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.test/avatar.png" } }),
    } as any);

    const updateEqMock = vi.fn().mockResolvedValue({
      error: { code: "42501", message: "permission denied for table profiles" },
    });
    vi.spyOn(supabase, "from").mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: updateEqMock,
      }),
    } as any);

    const { container, unmount } = renderWithRouter(
      <ProfileSettingsSection
        profile={profile}
        setProfile={mockSetProfile}
        showToast={mockShowToast}
      />,
    );

    // 1. Avatar DB update error must surface error and NOT call setProfile
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["img"], "avatar.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(container.textContent).toContain("プロフィール画像の保存に失敗しました");
    });
    expect(mockSetProfile).not.toHaveBeenCalled();

    // 2. Display name rejects whitespace-only input
    const editButtons = screen.getAllByRole("button", { name: "編集" });
    fireEvent.click(editButtons[0]);
    const displayInput = container.querySelector("#profile-display-name-input") as HTMLInputElement;
    fireEvent.change(displayInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(mockShowToast).toHaveBeenCalledWith("表示名を入力してください");

    // 3. Username edit distinguishes non-23505 errors from duplicate error
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getAllByRole("button", { name: "編集" })[1]);
    const usernameInput = container.querySelector("#profile-username-input") as HTMLInputElement;
    fireEvent.change(usernameInput, { target: { value: "valid_user_2" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(container.textContent).toContain("ユーザー名の更新に失敗しました");
    });
    expect(container.textContent).not.toContain("このユーザー名はすでに使われています");

    unmount();
  });
});
