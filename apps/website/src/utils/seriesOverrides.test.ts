// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vite-plus/test";
import {
  getLocalSeriesOverrides,
  setLocalSeriesOverride,
  removeLocalSeriesOverride,
  applySeriesOverrides,
} from "./seriesOverrides";
import type { Series } from "../types";

describe("seriesOverrides utils", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("handles empty or corrupted local storage", () => {
    expect(getLocalSeriesOverrides()).toEqual({});
    localStorage.setItem("quest_qlub_series_overrides_v1", "{invalid");
    expect(getLocalSeriesOverrides()).toEqual({});
  });

  it("saves, applies, and removes series overrides", () => {
    const originalSeries: Series[] = [
      {
        id: "s-1",
        title: "連載1",
        description: "説明1",
        writerId: "w-1",
      },
      {
        id: "s-2",
        title: "連載2",
        description: "説明2",
        writerId: "w-1",
      },
    ];

    // No overrides
    expect(applySeriesOverrides(originalSeries)).toEqual(originalSeries);

    // Set override for s-1
    setLocalSeriesOverride("s-1", {
      title: "更新後連載1",
      description: "更新後説明1",
    });

    const modified = applySeriesOverrides(originalSeries);
    expect(modified[0].title).toBe("更新後連載1");
    expect(modified[0].description).toBe("更新後説明1");
    expect(modified[1].title).toBe("連載2");

    // Mark s-2 as deleted
    setLocalSeriesOverride("s-2", {
      title: "連載2",
      deleted: true,
    });

    const afterDelete = applySeriesOverrides(originalSeries);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].id).toBe("s-1");

    // Remove override for s-1
    removeLocalSeriesOverride("s-1");
    const restored = applySeriesOverrides(originalSeries);
    expect(restored[0].id).toBe("s-1");
    expect(restored[0].title).toBe("連載1");
  });
});
