// @vitest-environment jsdom
import { describe, it, expect } from "vite-plus/test";
import { PrivacyView } from "./PrivacyView";
import { renderWithRouter } from "../test/test-utils";

describe("PrivacyView", () => {
  it("renders h1 heading, h2 section headings, and preserves legal text", () => {
    const { container, unmount } = renderWithRouter(<PrivacyView />, { route: "/privacy" });

    const h1 = container.querySelector("h1");
    expect(h1).not.toBeNull();
    expect(h1?.textContent).toBe("プライバシーポリシー");

    const h2s = Array.from(container.querySelectorAll("h2"));
    expect(h2s.length).toBe(7);
    expect(h2s[0]?.textContent).toBe("1. 収集する情報");
    expect(h2s[5]?.textContent).toBe("6. ポリシーの変更");
    expect(h2s[6]?.textContent).toBe("お問い合わせ窓口");

    expect(container.textContent).toContain("最終更新日：2026年5月");
    expect(container.textContent).toContain("Supabaseを通じて安全に管理されます");
    expect(container.textContent).toContain("戻る");

    unmount();
  });
});
