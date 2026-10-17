// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { OpeningAnimation } from "./OpeningAnimation";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("OpeningAnimation", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders when not seen before and types characters", () => {
    const root = createRoot(container);
    act(() => {
      root.render(<OpeningAnimation />);
    });

    // Opening animation dialog is rendered
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("スキップ");

    // Advance timer to finish typing
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(container.textContent).toContain("QUEST QLUB");
    expect(container.textContent).toContain("学びの「楽しい！」をつなげる");
  });

  it("skips and sets sessionStorage when skip button is clicked", () => {
    const onFinished = vi.fn();
    const root = createRoot(container);

    act(() => {
      root.render(<OpeningAnimation onFinished={onFinished} />);
    });

    const skipButton = container.querySelector("button");
    expect(skipButton).not.toBeNull();

    act(() => {
      skipButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(sessionStorage.getItem("share_quest_has_seen_opening")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onFinished).toHaveBeenCalled();
  });

  it("does not render if already seen in sessionStorage", () => {
    sessionStorage.setItem("share_quest_has_seen_opening", "true");
    const root = createRoot(container);

    act(() => {
      root.render(<OpeningAnimation />);
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
