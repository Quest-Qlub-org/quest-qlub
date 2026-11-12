// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { act } from "react";
import {
  LogoIcon,
  CustomHomeIcon,
  CustomSearchIcon,
  CustomUserIcon,
  CustomStarIcon,
  CustomSettingsIcon,
} from "./NavIcons";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("NavIcons decorative accessibility", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it("renders all decorative icons with empty alt and aria-hidden=true", () => {
    act(() => {
      root!.render(
        <div>
          <LogoIcon />
          <CustomHomeIcon />
          <CustomSearchIcon />
          <CustomUserIcon />
          <CustomStarIcon />
          <CustomSettingsIcon />
        </div>,
      );
    });

    const images = Array.from(container.querySelectorAll("img"));
    expect(images).toHaveLength(6);
    images.forEach((img) => {
      expect(img.getAttribute("alt")).toBe("");
      expect(img.getAttribute("aria-hidden")).toBe("true");
    });
  });

  it("applies active ring classes when active=true", () => {
    act(() => {
      root!.render(
        <div>
          <CustomHomeIcon active />
          <CustomStarIcon active />
          <CustomSettingsIcon active />
        </div>,
      );
    });

    const images = Array.from(container.querySelectorAll("img"));
    expect(images[0]?.className).toContain("ring-blue-500");
    expect(images[1]?.className).toContain("ring-yellow-400");
    expect(images[2]?.className).toContain("ring-gray-400");
  });
});
