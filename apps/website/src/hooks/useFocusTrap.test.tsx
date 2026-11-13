// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useFocusTrap } from "./useFocusTrap";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function TestModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button id="btn1">Button 1</button>
      <button id="btn2">Button 2</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  let rootContainer: HTMLDivElement;

  beforeEach(() => {
    rootContainer = document.createElement("div");
    document.body.appendChild(rootContainer);
  });

  afterEach(() => {
    document.body.removeChild(rootContainer);
    vi.restoreAllMocks();
  });

  it("handles Escape key to trigger onClose", async () => {
    const onClose = vi.fn();
    const root = createRoot(rootContainer);

    act(() => {
      root.render(<TestModal isOpen={true} onClose={onClose} />);
    });

    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    document.dispatchEvent(event);

    expect(onClose).toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("does not steal focus on parent re-renders with new inline onClose and calls latest callback", async () => {
    vi.useFakeTimers();
    const firstOnClose = vi.fn();
    const secondOnClose = vi.fn();
    const root = createRoot(rootContainer);

    act(() => {
      root.render(<TestModal isOpen={true} onClose={() => firstOnClose()} />);
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    const btn2 = rootContainer.querySelector("#btn2") as HTMLButtonElement;
    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    // Re-render with a fresh inline onClose
    act(() => {
      root.render(<TestModal isOpen={true} onClose={() => secondOnClose()} />);
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });

    // Focus must remain on btn2 rather than jumping back to btn1
    expect(document.activeElement).toBe(btn2);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    expect(firstOnClose).not.toHaveBeenCalled();
    expect(secondOnClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
  });
});
