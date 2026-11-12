// @vitest-environment jsdom
import { describe, it, expect } from "vite-plus/test";
import { TermsView } from "./TermsView";
import { renderWithRouter } from "../test/test-utils";

describe("TermsView", () => {
  it("renders h1 heading, h2 section headings, and preserves legal text", () => {
    const { container, unmount } = renderWithRouter(<TermsView />, { route: "/terms" });

    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toBe("利用規約");

    const h2s = Array.from(container.querySelectorAll("h2"));
    expect(h2s.length).toBe(7);
    expect(h2s[0]?.textContent).toBe("1. サービスの目的");
    expect(h2s[6]?.textContent).toBe("7. 規約の変更");

    expect(container.textContent).toContain("最終更新日：2026年5月");
    expect(container.textContent).toContain("戻る");
    expect(container.textContent).toContain("お問い合わせはこちら");

    unmount();
  });
});
