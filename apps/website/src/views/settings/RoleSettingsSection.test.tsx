// @vitest-environment jsdom
import { describe, it, expect, vi } from "vite-plus/test";
import { act } from "react";
import { RoleSettingsSection } from "./RoleSettingsSection";
import { renderWithRouter, createTestProfile } from "../../test/test-utils";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("RoleSettingsSection", () => {
  it("renders pure viewer account info with apply button", () => {
    const profile = createTestProfile({
      role: "viewer",
      roles: ["viewer"],
    });

    const { container, unmount } = renderWithRouter(<RoleSettingsSection profile={profile} />);

    expect(container.textContent).toContain("一般読者");
    expect(container.textContent).toContain("一般読者アカウント");
    expect(container.textContent).toContain("ライターに応募");

    const applyBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("ライターに応募"),
    );
    expect(applyBtn).toBeDefined();

    act(() => {
      applyBtn?.click();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/contact");

    unmount();
  });

  it("renders writer dashboard link for writer accounts", () => {
    const profile = createTestProfile({
      role: "writer",
      roles: ["writer"],
    });

    const { container, unmount } = renderWithRouter(<RoleSettingsSection profile={profile} />);

    expect(container.textContent).toContain("ライターダッシュボード");
    expect(container.textContent).not.toContain("一般読者アカウント");

    const writerDashBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("執筆画面へ"),
    );
    expect(writerDashBtn).toBeDefined();

    act(() => {
      writerDashBtn?.click();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/writer-dash");

    unmount();
  });

  it("renders editor and writer dashboard links for editor accounts", () => {
    const profile = createTestProfile({
      role: "editor",
      roles: ["editor"],
    });

    const { container, unmount } = renderWithRouter(<RoleSettingsSection profile={profile} />);

    expect(container.textContent).toContain("編集長ダッシュボード");
    expect(container.textContent).toContain("ライターダッシュボード");

    const editorDashBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("管理画面へ"),
    );
    expect(editorDashBtn).toBeDefined();

    act(() => {
      editorDashBtn?.click();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/editor-dash");

    unmount();
  });

  it("renders engineer card and navigate to about for engineer accounts", () => {
    const profile = createTestProfile({
      role: "viewer",
      roles: ["engineer"],
    });

    const { container, unmount } = renderWithRouter(<RoleSettingsSection profile={profile} />);

    expect(container.textContent).toContain("エンジニア権限");
    expect(container.textContent).toContain("システム開発・保守・技術支援");

    const aboutBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Aboutページへ"),
    );
    expect(aboutBtn).toBeDefined();

    act(() => {
      aboutBtn?.click();
    });
    expect(mockNavigate).toHaveBeenCalledWith("/about");

    unmount();
  });

  it("renders both writer and engineer cards for multi-role writer+engineer", () => {
    const profile = createTestProfile({
      role: "writer",
      roles: ["writer", "engineer"],
    });

    const { container, unmount } = renderWithRouter(<RoleSettingsSection profile={profile} />);

    // 両方のロールバッジが表示される
    expect(container.textContent).toContain("ライター");
    expect(container.textContent).toContain("エンジニア");

    // ライター用カードとエンジニア用カードの両方が表示される
    expect(container.textContent).toContain("ライターダッシュボード");
    expect(container.textContent).toContain("エンジニア権限");

    unmount();
  });
});
