// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ProfileSettingsSection } from "./ProfileSettingsSection";
import { renderWithRouter, createTestProfile } from "../../test/test-utils";
import * as useFollowsModule from "../../hooks/useFollows";

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

    renderWithRouter(
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
  });
});
