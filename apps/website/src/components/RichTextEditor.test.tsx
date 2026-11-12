// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vite-plus/test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import RichTextEditor from "./RichTextEditor";

describe("RichTextEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (!Range.prototype.getClientRects) {
      Range.prototype.getClientRects = (() => []) as unknown as Range["getClientRects"];
    }
    if (!Range.prototype.getBoundingClientRect) {
      Range.prototype.getBoundingClientRect = (() =>
        new DOMRect()) as unknown as Range["getBoundingClientRect"];
    }
    if (!HTMLElement.prototype.getClientRects) {
      HTMLElement.prototype.getClientRects = (() => []) as unknown as HTMLElement["getClientRects"];
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("opens image modal with dialog accessibility attributes and inserts image with alt text via URL (#108, #111)", async () => {
    const onChange = vi.fn();
    render(<RichTextEditor content="<p>初期テキスト</p>" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "画像を挿入" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("rte-image-modal-title");
    expect(screen.getByRole("button", { name: "閉じる" })).toBeTruthy();

    const altInput = screen.getByLabelText("代替テキスト（alt・任意）");
    const urlInput = screen.getByLabelText("画像URL");

    fireEvent.change(altInput, { target: { value: "サンプル画像の説明" } });
    fireEvent.change(urlInput, { target: { value: "https://example.com/photo.png" } });
    fireEvent.click(screen.getByRole("button", { name: "URLから挿入" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await waitFor(() => {
      const lastHtml = onChange.mock.calls.at(-1)?.[0] as string | undefined;
      expect(lastHtml).toContain('src="https://example.com/photo.png"');
      expect(lastHtml).toContain('alt="サンプル画像の説明"');
    });
  });

  it("inserts uploaded image with alt text and closes modal on Escape (#108, #111)", async () => {
    const onChange = vi.fn();
    const onUploadImage = vi.fn().mockResolvedValue("https://cdn.example.com/uploaded.webp");

    render(
      <RichTextEditor
        content="<p>初期テキスト</p>"
        onChange={onChange}
        onUploadImage={onUploadImage}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "画像を挿入" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "画像を挿入" }));
    fireEvent.change(screen.getByLabelText("代替テキスト（alt・任意）"), {
      target: { value: "アップロード画像" },
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["dummy"], "test.webp", { type: "image/webp" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(onUploadImage).toHaveBeenCalledWith(file);
    });

    await waitFor(() => {
      const lastHtml = onChange.mock.calls.at(-1)?.[0] as string | undefined;
      expect(lastHtml).toContain('src="https://cdn.example.com/uploaded.webp"');
      expect(lastHtml).toContain('alt="アップロード画像"');
    });
  });

  it("renders color picker as radiogroup with radio states (#110)", () => {
    render(<RichTextEditor content="<p>テキスト</p>" onChange={vi.fn()} />);

    const colorBtn = screen.getByRole("button", { name: "文字色" });
    expect(colorBtn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(colorBtn);
    expect(colorBtn.getAttribute("aria-expanded")).toBe("true");

    const radiogroup = screen.getByRole("radiogroup");
    expect(radiogroup).toBeTruthy();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(0);
    expect(radios[0].getAttribute("aria-checked")).not.toBeNull();
  });
});
