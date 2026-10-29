// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { act } from "react";
import { PwaInstallSettingsSection } from "./PwaInstallSettingsSection";
import * as PwaHook from "../../hooks/usePwaInstall";
import { renderWithRouter } from "../../test/test-utils";

describe("PwaInstallSettingsSection", () => {
  const mockShowToast = vi.fn();

  beforeEach(() => {
    mockShowToast.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders subtle restore trigger when isDismissed is true and app is not installed", () => {
    const resetDismissed = vi.fn();
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: false,
      isInstalled: false,
      isIos: false,
      isDismissed: true,
      canInstallPrompt: false,
      promptInstall: vi.fn(),
      dismiss: vi.fn(),
      resetDismissed,
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    // Section is hidden
    expect(container.querySelector('[data-testid="pwa-install-settings-section"]')).toBeNull();
    // Non-intrusive restore button is available
    const restoreBtn = container.querySelector(
      '[data-testid="pwa-restore-button"]',
    ) as HTMLButtonElement;
    expect(restoreBtn).not.toBeNull();
    expect(restoreBtn.textContent).toContain("アプリ（PWA）のインストール案内を再表示");

    act(() => {
      restoreBtn.click();
    });

    expect(resetDismissed).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith("アプリのインストール案内を再表示しました");

    unmount();
  });

  it("renders completely null when isDismissed is true and app is already installed", () => {
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: true,
      isInstalled: true,
      isIos: false,
      isDismissed: true,
      canInstallPrompt: false,
      promptInstall: vi.fn(),
      dismiss: vi.fn(),
      resetDismissed: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    expect(container.querySelector('[data-testid="pwa-install-settings-section"]')).toBeNull();
    expect(container.querySelector('[data-testid="pwa-restore-button"]')).toBeNull();

    unmount();
  });

  it("renders installed state when isStandalone or isInstalled is true", () => {
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: true,
      isInstalled: true,
      isIos: false,
      isDismissed: false,
      canInstallPrompt: false,
      promptInstall: vi.fn(),
      dismiss: vi.fn(),
      resetDismissed: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    expect(container.querySelector('[data-testid="pwa-installed-badge"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pwa-installed-content"]')).not.toBeNull();
    expect(container.textContent).toContain("Quest Qlub はアプリとしてインストールされています");
    expect(container.querySelector('[data-testid="pwa-install-button"]')).toBeNull();

    unmount();
  });

  it("renders promptable button and triggers installation on click", async () => {
    const promptInstall = vi.fn().mockResolvedValue("accepted");
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: false,
      isInstalled: false,
      isIos: false,
      isDismissed: false,
      canInstallPrompt: true,
      promptInstall,
      dismiss: vi.fn(),
      resetDismissed: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    const installBtn = container.querySelector(
      '[data-testid="pwa-install-button"]',
    ) as HTMLButtonElement;
    expect(installBtn).not.toBeNull();
    expect(installBtn.textContent).toContain("アプリをインストール");

    await act(async () => {
      installBtn.click();
    });

    expect(promptInstall).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith("アプリをインストールしました");

    unmount();
  });

  it("handles user dismissing the native prompt", async () => {
    const promptInstall = vi.fn().mockResolvedValue("dismissed");
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: false,
      isInstalled: false,
      isIos: false,
      isDismissed: false,
      canInstallPrompt: true,
      promptInstall,
      dismiss: vi.fn(),
      resetDismissed: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    const installBtn = container.querySelector(
      '[data-testid="pwa-install-button"]',
    ) as HTMLButtonElement;

    await act(async () => {
      installBtn.click();
    });

    expect(promptInstall).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith("インストールをキャンセルしました");

    unmount();
  });

  it("renders iOS Safari step-by-step instructions on iOS devices", () => {
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: false,
      isInstalled: false,
      isIos: true,
      isDismissed: false,
      canInstallPrompt: false,
      promptInstall: vi.fn(),
      dismiss: vi.fn(),
      resetDismissed: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    const iosContent = container.querySelector('[data-testid="pwa-ios-content"]');
    expect(iosContent).not.toBeNull();
    expect(iosContent?.textContent).toContain(
      "iOS（Safari）では、以下の手順でホーム画面にアプリを追加できます",
    );
    expect(iosContent?.textContent).toContain("共有ボタン");
    expect(iosContent?.textContent).toContain("ホーム画面に追加");

    unmount();
  });

  it("renders general instructions when not promptable, not iOS, and not installed", () => {
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: false,
      isInstalled: false,
      isIos: false,
      isDismissed: false,
      canInstallPrompt: false,
      promptInstall: vi.fn(),
      dismiss: vi.fn(),
      resetDismissed: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    const generalContent = container.querySelector('[data-testid="pwa-general-content"]');
    expect(generalContent).not.toBeNull();
    expect(generalContent?.textContent).toContain("インストールアイコン");
    expect(generalContent?.textContent).toContain("Quest Qlub をインストール");

    unmount();
  });

  it("calls dismiss and showToast when clicking the header close button", () => {
    const dismiss = vi.fn();
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: false,
      isInstalled: false,
      isIos: false,
      isDismissed: false,
      canInstallPrompt: false,
      promptInstall: vi.fn(),
      dismiss,
      resetDismissed: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    const closeBtn = container.querySelector(
      '[data-testid="pwa-dismiss-button"]',
    ) as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();

    act(() => {
      closeBtn.click();
    });

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith("インストール案内を非表示にしました");

    unmount();
  });

  it("calls dismiss and showToast when clicking the footer dismiss link", () => {
    const dismiss = vi.fn();
    vi.spyOn(PwaHook, "usePwaInstall").mockReturnValue({
      isStandalone: false,
      isInstalled: false,
      isIos: false,
      isDismissed: false,
      canInstallPrompt: false,
      promptInstall: vi.fn(),
      dismiss,
      resetDismissed: vi.fn(),
    });

    const { container, unmount } = renderWithRouter(
      <PwaInstallSettingsSection showToast={mockShowToast} />,
    );

    const dismissLink = container.querySelector(
      '[data-testid="pwa-dismiss-link"]',
    ) as HTMLButtonElement;
    expect(dismissLink).not.toBeNull();

    act(() => {
      dismissLink.click();
    });

    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith("インストール案内を非表示にしました");

    unmount();
  });
});
