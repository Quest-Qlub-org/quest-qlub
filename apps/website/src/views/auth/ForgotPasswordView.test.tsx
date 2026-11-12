// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { act } from "react";
import { ForgotPasswordView } from "./ForgotPasswordView";
import { renderWithRouter } from "../../test/test-utils";
import * as AppContextModule from "../../context/AppContext";

vi.mock("../../utils/antiSpam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../utils/antiSpam")>();
  return {
    ...actual,
    verifySpamCheck: vi.fn().mockReturnValue({ isSpam: false }),
    getRemainingCooldownSeconds: vi.fn().mockReturnValue(0),
    recordSubmissionTimestamp: vi.fn(),
  };
});

describe("ForgotPasswordView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AppContextModule, "useApp").mockReturnValue({
      navigate: vi.fn(),
      showToast: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("associates label with email input and announces errors via role=alert", async () => {
    const { container, unmount } = renderWithRouter(<ForgotPasswordView />, {
      route: "/forgot-password",
    });

    expect(container.querySelector('label[for="forgot-password-email"]')).not.toBeNull();
    const emailInput = container.querySelector("#forgot-password-email") as HTMLInputElement;
    expect(emailInput.required).toBe(true);
    expect(emailInput.getAttribute("aria-required")).toBe("true");
    expect(emailInput.getAttribute("aria-invalid")).toBe("false");

    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl?.id).toBe("forgot-password-error");
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    expect(emailInput.getAttribute("aria-describedby")).toBe("forgot-password-error");

    unmount();
  });
});
