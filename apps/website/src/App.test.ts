import { describe, it, expect } from "vite-plus/test";
import { getThumbnailColor, THUMBNAIL_COLORS } from "./App";

describe("getThumbnailColor", () => {
  it("returns the corresponding color object when given a valid color ID", () => {
    const green = getThumbnailColor("green");
    expect(green.id).toBe("green");
    expect(green.bg).toBe("bg-green-100");
    expect(green.text).toBe("text-green-400");
  });

  it("falls back to the first color (blue) when given null or an unknown color ID", () => {
    const fallbackNull = getThumbnailColor(null);
    expect(fallbackNull).toEqual(THUMBNAIL_COLORS[0]);
    expect(fallbackNull.id).toBe("blue");

    const fallbackUnknown = getThumbnailColor("nonexistent-color");
    expect(fallbackUnknown).toEqual(THUMBNAIL_COLORS[0]);
  });
});
