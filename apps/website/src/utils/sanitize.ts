import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "blockquote",
  "pre",
  "code",
  "hr",
  "br",
  "span",
  "div", // TipTapのCustomFrame（独自見出し枠）で使用
];

const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "class",
  "style",
  "target",
  "rel",
  "data-type", // CustomFrameの種類属性
  "contenteditable", // CustomFrameタイトルの読み取り専用制御（"false" のみ許可）
];

const SAFE_CSS_PROPERTIES = new Set([
  "color",
  "background-color",
  "border",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "text-align",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "padding",
  "padding-left",
  "padding-right",
  "padding-top",
  "padding-bottom",
  "margin",
  "margin-left",
  "margin-right",
  "margin-top",
  "margin-bottom",
  "line-height",
  "width",
  "max-width",
  "height",
]);

function filterSafeStyles(rawStyle: string): string {
  const declarations = rawStyle.split(";");
  const safeDeclarations: string[] = [];

  for (const decl of declarations) {
    const trimmed = decl.trim();
    if (!trimmed) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) continue;

    const prop = trimmed.slice(0, colonIndex).trim().toLowerCase();
    const val = trimmed.slice(colonIndex + 1).trim();

    // Dangerous patterns in values (url, expression, javascript, fixed positioning, etc.)
    if (/url\(|expression\(|javascript:|behavior:|binding:/i.test(val)) {
      continue;
    }

    if (SAFE_CSS_PROPERTIES.has(prop)) {
      // ダークモード時に黒文字黒背景の同化や白帯を防ぐため、
      // デフォルト文字色相当（純黒・暗色）および純白背景のインラインスタイルを除去して親のテーマ色に追従させる
      if (prop === "color") {
        const norm = val.toLowerCase().replace(/\s+/g, "");
        if (
          norm === "#000" ||
          norm === "#000000" ||
          norm === "black" ||
          norm === "rgb(0,0,0)" ||
          norm === "rgba(0,0,0,1)" ||
          norm === "rgb(17,24,39)" ||
          norm === "rgb(31,41,55)"
        ) {
          continue;
        }
      } else if (prop === "background-color") {
        const norm = val.toLowerCase().replace(/\s+/g, "");
        if (
          norm === "#fff" ||
          norm === "#ffffff" ||
          norm === "white" ||
          norm === "rgb(255,255,255)" ||
          norm === "rgba(255,255,255,1)"
        ) {
          continue;
        }
      }

      safeDeclarations.push(`${prop}: ${val}`);
    }
  }

  return safeDeclarations.join("; ");
}

const INTERNAL_HOSTNAMES = new Set<string>(["quest-qlub.vercel.app"]);

try {
  const configuredSiteUrl = (import.meta.env?.VITE_SITE_URL as string | undefined)?.trim();
  if (configuredSiteUrl) {
    INTERNAL_HOSTNAMES.add(new URL(configuredSiteUrl).hostname.toLowerCase());
  }
} catch {
  // 無効な VITE_SITE_URL は無視
}

function isExternalHttpLink(href: string): boolean {
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return !INTERNAL_HOSTNAMES.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// 外部リンクへの rel="ugc noopener noreferrer" 付与・リバースタブナビング防止 & style属性のプロパティ制限
if (typeof DOMPurify?.addHook === "function") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (isExternalHttpLink(href)) {
        node.setAttribute("rel", "ugc noopener noreferrer");
      } else if (node.getAttribute("target") === "_blank") {
        node.setAttribute("rel", "noopener noreferrer");
      }
    }

    if (node.hasAttribute("contenteditable")) {
      if (node.getAttribute("contenteditable")?.toLowerCase() !== "false") {
        node.removeAttribute("contenteditable");
      }
    }

    if (node.hasAttribute("style")) {
      const rawStyle = node.getAttribute("style") || "";
      const filtered = filterSafeStyles(rawStyle);
      if (filtered) {
        node.setAttribute("style", filtered);
      } else {
        node.removeAttribute("style");
      }
    }
  });
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
