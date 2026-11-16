// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { renderHook, act } from "@testing-library/react";
import { useSubmissionCooldown } from "./useSubmissionCooldown";

describe("useSubmissionCooldown", () => {
  const STORAGE_KEY = "test_cooldown_key";

  beforeEach(() => {
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("initializes with 0 when no previous submission timestamp exists", () => {
    const { result } = renderHook(() => useSubmissionCooldown(STORAGE_KEY, 15000));
    expect(result.current.cooldown).toBe(0);
    expect(result.current.isCoolingDown).toBe(false);
  });

  it("triggers cooldown and counts down once per second without recreating interval", () => {
    const { result } = renderHook(() => useSubmissionCooldown(STORAGE_KEY, 5000));

    act(() => {
      result.current.triggerCooldown();
    });

    expect(result.current.cooldown).toBe(5);
    expect(result.current.isCoolingDown).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.cooldown).toBe(2);
    expect(result.current.isCoolingDown).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.cooldown).toBe(0);
    expect(result.current.isCoolingDown).toBe(false);
  });

  it("restores remaining cooldown from sessionStorage on mount", () => {
    sessionStorage.setItem(STORAGE_KEY, String(Date.now() - 2000));
    const { result } = renderHook(() => useSubmissionCooldown(STORAGE_KEY, 10000));
    expect(result.current.cooldown).toBe(8);
    expect(result.current.isCoolingDown).toBe(true);
  });
});
