// @vitest-environment jsdom
import { describe, it, expect } from "vite-plus/test";
import { sanitizeHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("allows safe HTML elements", () => {
    const input = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("removes script tags to prevent XSS", () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    expect(sanitizeHtml(input)).toBe("<p>Hello</p>");
  });

  it("removes inline event handlers", () => {
    const input = '<img src="valid.png" onerror="alert(1)" alt="test">';
    const output = sanitizeHtml(input);
    expect(output).not.toContain("onerror");
    expect(output).toContain('src="valid.png"');
  });

  it("removes javascript: pseudo-protocol in links", () => {
    const input = '<a href="javascript:alert(1)">Click me</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain("javascript:");
  });

  it('adds rel="noopener noreferrer" to links with target="_blank"', () => {
    const input = '<a href="https://example.com" target="_blank">External Link</a>';
    const output = sanitizeHtml(input);
    expect(output).toContain('rel="noopener noreferrer"');
    expect(output).toContain('target="_blank"');
  });

  it("preserves TipTap CustomFrame attributes", () => {
    const input =
      '<div data-type="custom-frame" class="custom-frame my-4" style="background-color: #f0fdf4; border: 2px solid #22c55e;">' +
      '<div class="frame-title" contenteditable="false">タイトル</div>' +
      '<div class="frame-content"><p>本文内容</p></div>' +
      "</div>";
    const output = sanitizeHtml(input);
    expect(output).toContain('data-type="custom-frame"');
    expect(output).toContain('contenteditable="false"');
    expect(output).toContain("frame-title");
    expect(output).toContain("frame-content");
    expect(output).toContain("background-color: #f0fdf4");
  });

  it("disallows dangerous tags like iframe and form", () => {
    const input = '<iframe src="https://evil.com"></iframe><form action="/steal"><input /></form>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain("iframe");
    expect(output).not.toContain("form");
  });

  it("filters dangerous CSS properties like position and z-index from style attribute", () => {
    const input =
      '<p style="position: fixed; z-index: 9999; top: 0; left: 0; color: red;">Dangerous overlay</p>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain("position");
    expect(output).not.toContain("z-index");
    expect(output).not.toContain("top");
    expect(output).toContain("color: red");
  });

  it("removes url() and javascript: in style attributes", () => {
    const input =
      '<span style="background-color: url(https://evil.com/bg); color: blue;">Styled</span>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain("url(");
    expect(output).toContain("color: blue");
  });

  it("strips black/dark inline text color and white inline background color for theme adaptability", () => {
    const input =
      '<span style="color: rgb(0, 0, 0)">Quest</span><span style="color: #000000">Qlub</span><span style="color: red; background-color: #ffffff">Alert</span>';
    const output = sanitizeHtml(input);
    // color: rgb(0, 0, 0) や #000000 は除去されて親のテーマカラーに追従
    expect(output).not.toContain("color: rgb(0, 0, 0)");
    expect(output).not.toContain("color: #000000");
    // 赤などのカラーハイライトは保持され、白背景は除去される
    expect(output).toContain("color: red");
    expect(output).not.toContain("background-color");
  });
});
