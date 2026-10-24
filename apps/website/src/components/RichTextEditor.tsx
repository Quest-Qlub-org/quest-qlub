import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { Extension, Node as TipTapNode, mergeAttributes } from "@tiptap/core";
import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link2,
  ImagePlus,
  Minus,
  Undo2,
  Redo2,
  Eraser,
  CornerDownLeft,
  Upload,
  Loader2,
  X,
} from "lucide-react";

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el: HTMLElement) => el.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attrs: Record<string, any>) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    } as any;
  },
});

export const CustomFrame = TipTapNode.create({
  name: "customFrame",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      type: {
        default: "theme",
        parseHTML: (element) => element.getAttribute("data-type") || "theme",
        renderHTML: (attributes) => ({ "data-type": attributes.type }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-type]",
        contentElement: (node) => {
          const el = node as HTMLElement;
          return (el.querySelector(".custom-frame-body") as HTMLElement) || el;
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const type = node.attrs.type;
    let className = "custom-frame rounded-r-xl ";
    let title = "";
    if (type === "theme") {
      className += "custom-frame-theme";
      title = "📌 テーマ";
    } else if (type === "verification") {
      className += "custom-frame-verification";
      title = "🔍 検証";
    } else if (type === "summary") {
      className += "custom-frame-summary";
      title = "💡 まとめ";
    } else if (type === "note") {
      className += "custom-frame-note";
      title = "📝 補足・注意";
    }
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: className }),
      ["div", { class: "custom-frame-title", contenteditable: "false" }, title],
      ["div", { class: "custom-frame-body" }, 0],
    ];
  },
  addCommands() {
    return {
      setCustomFrame:
        (type: string) =>
        ({ editor, commands }: any) => {
          if (editor.isActive(this.name)) {
            return commands.updateAttributes(this.name, { type });
          }
          return commands.wrapIn(this.name, { type });
        },
      unsetCustomFrame:
        () =>
        ({ commands }: any) => {
          return commands.lift(this.name);
        },
      toggleCustomFrame:
        (type: string) =>
        ({ editor, commands }: any) => {
          if (editor.isActive(this.name, { type })) {
            return commands.lift(this.name);
          }
          if (editor.isActive(this.name)) {
            return commands.updateAttributes(this.name, { type });
          }
          return commands.wrapIn(this.name, { type });
        },
    } as any;
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Enter": () => {
        if (!this.editor.isActive(this.name)) return false;
        return this.editor.chain().focus().exitCode().lift(this.name).run();
      },
    };
  },
});

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onUploadImage?: (file: File) => Promise<string | null>;
}

const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "36", "48"];
const FONT_FAMILIES = [
  { label: "標準フォント", value: "" },
  { label: "ゴシック体", value: "sans-serif" },
  { label: "明朝体", value: "serif" },
  { label: "等幅", value: "monospace" },
];
const COLORS = [
  "#000000",
  "#374151",
  "#6B7280",
  "#bf783a",
  "#EF4444",
  "#F97316",
  "#EAB308",
  "#22C55E",
  "#0EA5E9",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
];

export default function RichTextEditor({ content, onChange, placeholder, onUploadImage }: Props) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [showImageInput, setShowImageInput] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-600 underline cursor-pointer" },
      }),
      Image.configure({ HTMLAttributes: { class: "max-w-full rounded-lg my-3 mx-auto" } }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      CustomFrame,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "本文を入力してください..." }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "article-content min-h-[480px] p-4 md:p-6 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;

    const isCurrentEmpty = editor.isEmpty;
    const isNewEmpty = !content || content === "<p></p>";
    if (isCurrentEmpty && isNewEmpty) return;

    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node))
        setShowColorPicker(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const openLinkModal = useCallback(() => {
    if (!editor) return;
    const existingHref = editor.getAttributes("link").href ?? "";
    setLinkUrl(existingHref);
    setLinkError("");
    setShowLinkInput(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const trimmed = linkUrl.trim();
    if (!trimmed) {
      editor.chain().focus().unsetLink().run();
      setShowLinkInput(false);
      setLinkUrl("");
      setLinkError("");
      return;
    }

    // 危険なスキームを拒絶（javascript:, vbscript:, data: 等のXSSベクター）
    if (/^(javascript|vbscript|data):/i.test(trimmed)) {
      setLinkError("安全なURL（https://, http://, mailto: 等）を入力してください");
      return;
    }

    // プロトコル未指定の場合は安全のため https:// を付与
    let safeUrl = trimmed;
    if (
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) &&
      !trimmed.startsWith("/") &&
      !trimmed.startsWith("#")
    ) {
      safeUrl = `https://${trimmed}`;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: safeUrl }).run();
    setShowLinkInput(false);
    setLinkUrl("");
    setLinkError("");
  }, [editor, linkUrl]);

  const insertImage = useCallback(() => {
    if (!editor || !imageUrl.trim()) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    setShowImageInput(false);
    setImageUrl("");
  }, [editor, imageUrl]);

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor || !onUploadImage) return;
    setImageUploading(true);
    try {
      const uploadedUrl = await onUploadImage(file);
      if (uploadedUrl) {
        editor.chain().focus().setImage({ src: uploadedUrl }).run();
        setShowImageInput(false);
        setImageUrl("");
      }
    } finally {
      setImageUploading(false);
    }
  };

  const exitCustomFrame = useCallback(() => {
    if (!editor) return;
    const { state } = editor;
    const { $from } = state.selection;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === "customFrame") {
        const afterPos = $from.after(d);
        editor
          .chain()
          .focus()
          .insertContentAt(afterPos, { type: "paragraph" })
          .setTextSelection(afterPos + 1)
          .run();
        return;
      }
    }
  }, [editor]);

  const plainTextStats = useMemo(() => {
    const text = content
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, "&")
      .trim();
    const charCount = text.replace(/\s+/g, "").length;
    const readingMinutes = Math.max(1, Math.ceil(charCount / 500));
    return { charCount, readingMinutes };
  }, [content]);

  if (!editor) return null;

  const activeHeading = editor.isActive("heading", { level: 1 })
    ? "h1"
    : editor.isActive("heading", { level: 2 })
      ? "h2"
      : editor.isActive("heading", { level: 3 })
        ? "h3"
        : "paragraph";

  const activeFrame = editor.isActive("customFrame", { type: "theme" })
    ? "theme"
    : editor.isActive("customFrame", { type: "verification" })
      ? "verification"
      : editor.isActive("customFrame", { type: "summary" })
        ? "summary"
        : editor.isActive("customFrame", { type: "note" })
          ? "note"
          : "";

  const activeFontFamily = (editor.getAttributes("textStyle").fontFamily as string) || "";
  const activeFontSize =
    ((editor.getAttributes("textStyle").fontSize as string) || "").replace("px", "") || "";
  const activeColor = (editor.getAttributes("textStyle").color as string) || "#000000";

  const TB = ({
    onClick,
    active,
    title,
    children,
  }: {
    onClick: () => void;
    active?: boolean;
    title: string;
    children: React.ReactNode;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-colors ${
        active
          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold shadow-xs"
          : "text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
      }`}
    >
      {children}
    </button>
  );

  const Div = () => (
    <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1 self-center shrink-0" />
  );

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 shadow-sm overflow-visible">
      {/* ツールバー */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur px-2.5 py-2 flex flex-wrap items-center gap-1 rounded-t-2xl sticky top-[104px] z-20">
        {/* 段落・見出し */}
        <select
          aria-label="見出しスタイル"
          className="text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={activeHeading}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "paragraph") editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: parseInt(v[1], 10) as 1 | 2 | 3 })
                .run();
          }}
        >
          <option value="paragraph">本文</option>
          <option value="h1">見出し 1 (大)</option>
          <option value="h2">見出し 2 (中)</option>
          <option value="h3">見出し 3 (小)</option>
        </select>

        {/* コールアウト枠 */}
        <select
          aria-label="コールアウト枠"
          className="text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={activeFrame}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              (editor.chain().focus() as any).unsetCustomFrame().run();
            } else {
              (editor.chain().focus() as any).setCustomFrame(v).run();
            }
          }}
        >
          <option value="">枠なし</option>
          <option value="theme">📌 テーマ枠</option>
          <option value="verification">🔍 検証枠</option>
          <option value="summary">💡 まとめ枠</option>
          <option value="note">📝 補足・注意枠</option>
        </select>

        {activeFrame && (
          <button
            type="button"
            onClick={exitCustomFrame}
            title="枠の外に新しい段落を追加"
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
            <span>枠外へ改行</span>
          </button>
        )}

        {/* フォント種類 */}
        <select
          aria-label="フォント"
          className="text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={activeFontFamily}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>

        {/* 文字サイズ */}
        <select
          aria-label="文字サイズ"
          className="text-xs font-medium border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={activeFontSize}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) (editor.chain().focus() as any).unsetFontSize().run();
            else (editor.chain().focus() as any).setFontSize(`${v}px`).run();
          }}
        >
          <option value="">標準サイズ</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>

        <Div />

        {/* 文字装飾 */}
        <TB
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="太字 (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="斜体 (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="下線 (Ctrl+U)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          title="取り消し線"
        >
          <Strikethrough className="w-4 h-4" />
        </TB>

        {/* 文字色 */}
        <div className="relative" ref={colorRef}>
          <button
            type="button"
            title="文字色"
            aria-label="文字色"
            onClick={() => setShowColorPicker((v) => !v)}
            className="flex flex-col items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-200/70 transition-colors"
          >
            <span className="text-xs font-extrabold text-gray-700 leading-none">A</span>
            <span
              className="h-1 w-4 rounded-full mt-0.5 border border-black/10"
              style={{ backgroundColor: activeColor }}
            />
          </button>
          {showColorPicker && (
            <div className="absolute top-10 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-48">
              <p className="text-[11px] font-bold text-gray-500 mb-2">文字色を選択</p>
              <div className="grid grid-cols-6 gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      editor.chain().focus().setColor(c).run();
                      setShowColorPicker(false);
                    }}
                    className={`w-6 h-6 rounded-md border transition-transform hover:scale-110 ${
                      activeColor.toLowerCase() === c.toLowerCase()
                        ? "border-gray-900 ring-2 ring-blue-400"
                        : "border-gray-200"
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColorPicker(false);
                }}
                className="mt-2.5 py-1 text-xs font-bold text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 rounded-lg w-full text-center transition-colors"
              >
                標準色に戻す
              </button>
            </div>
          )}
        </div>

        {/* 書式クリア */}
        <TB
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          active={false}
          title="書式をクリア"
        >
          <Eraser className="w-4 h-4" />
        </TB>

        <Div />

        {/* テキスト配置 */}
        <TB
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="左揃え"
        >
          <AlignLeft className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="中央揃え"
        >
          <AlignCenter className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="右揃え"
        >
          <AlignRight className="w-4 h-4" />
        </TB>

        <Div />

        {/* リスト・引用・コード */}
        <TB
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="箇条書きリスト"
        >
          <List className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="番号付きリスト"
        >
          <ListOrdered className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          title="引用"
        >
          <Quote className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive("codeBlock")}
          title="コードブロック"
        >
          <Code2 className="w-4 h-4" />
        </TB>
        <TB
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          active={false}
          title="区切り線"
        >
          <Minus className="w-4 h-4" />
        </TB>

        <Div />

        {/* リンク・画像 */}
        <TB onClick={openLinkModal} active={editor.isActive("link")} title="リンクを挿入・編集">
          <Link2 className="w-4 h-4" />
        </TB>
        <TB onClick={() => setShowImageInput((v) => !v)} active={false} title="画像を挿入">
          <ImagePlus className="w-4 h-4" />
        </TB>

        {/* 元に戻す・やり直し */}
        <div className="ml-auto flex items-center gap-0.5">
          <TB onClick={() => editor.chain().focus().undo().run()} active={false} title="元に戻す">
            <Undo2 className="w-4 h-4" />
          </TB>
          <TB onClick={() => editor.chain().focus().redo().run()} active={false} title="やり直し">
            <Redo2 className="w-4 h-4" />
          </TB>
        </div>
      </div>

      {/* リンク設定モーダル */}
      {showLinkInput && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowLinkInput(false)}
        >
          <div
            className="bg-white border border-gray-200 rounded-2xl shadow-xl p-5 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-800">リンクURLを設定</p>
              <button
                type="button"
                onClick={() => setShowLinkInput(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => {
                setLinkUrl(e.target.value);
                setLinkError("");
              }}
              placeholder="https://example.com"
              className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400 mb-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  setShowLinkInput(false);
                }
              }}
              autoFocus
            />
            {linkError && <p className="text-xs text-red-500 mb-3 font-medium">{linkError}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={applyLink}
                className="flex-1 bg-blue-600 text-white text-sm rounded-xl py-2.5 font-bold hover:bg-blue-700 transition-colors"
              >
                適用する
              </button>
              {editor.isActive("link") && (
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setShowLinkInput(false);
                  }}
                  className="px-4 border border-red-200 text-red-600 text-sm font-bold rounded-xl py-2.5 hover:bg-red-50 transition-colors"
                >
                  リンク解除
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 画像挿入モーダル */}
      {showImageInput && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowImageInput(false)}
        >
          <div
            className="bg-white border border-gray-200 rounded-2xl shadow-xl p-5 w-full max-w-sm space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-800">本文に画像を挿入</p>
              <button
                type="button"
                onClick={() => setShowImageInput(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {onUploadImage && (
              <div>
                <label className="w-full py-3 px-4 border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 text-blue-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                  {imageUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>アップロード中...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>端末から画像をアップロード (JPG/PNG/WebP/GIF)</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => void handleImageFileSelect(e)}
                    disabled={imageUploading}
                  />
                </label>
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-gray-200" />
                  <span className="flex-shrink mx-3 text-[11px] text-gray-400">
                    またはURLを指定
                  </span>
                  <div className="flex-grow border-t border-gray-200" />
                </div>
              </div>
            )}

            <div>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-400 mb-3"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    insertImage();
                  } else if (e.key === "Escape") {
                    setShowImageInput(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={insertImage}
                disabled={!imageUrl.trim()}
                className="w-full bg-blue-600 text-white text-sm rounded-xl py-2.5 font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                URLから挿入
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
      `}</style>

      {/* エディタ本文 */}
      <EditorContent editor={editor} />

      {/* ステータスフッター（文字数・読了目安） */}
      <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/70 px-4 py-2 rounded-b-2xl flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>
          {activeFrame ? "💡 枠内編集中（Ctrl+Enter または「枠外へ改行」で枠を出られます）" : ""}
        </span>
        <div className="flex items-center gap-4 font-medium">
          <span>文字数: {plainTextStats.charCount.toLocaleString()} 文字</span>
          <span>
            読了目安: {plainTextStats.charCount === 0 ? "0" : `約${plainTextStats.readingMinutes}`}
            分
          </span>
        </div>
      </div>
    </div>
  );
}
