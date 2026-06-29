import path from "node:path";
import { marked } from "./vendor/marked/marked.esm.js";

export function parseMarkdownPage(filePath, rawMarkdown) {
  const { frontmatter, body } = splitFrontmatter(rawMarkdown);
  const metadata = parseYamlLikeFrontmatter(frontmatter);
  const headings = extractHeadings(body);
  const plainText = markdownToPlainText(body);
  const id = metadata.id || slugFromPath(filePath);
  const summary = metadata.summary ? cleanDisplayText(metadata.summary) : firstUsefulParagraph(body);

  return {
    id,
    title: metadata.title ? cleanDisplayText(metadata.title) : titleFromId(id),
    type: metadata.type || "page",
    module: metadata.module || "uncategorized",
    tags: normalizeArray(metadata.tags),
    difficulty: metadata.difficulty || "",
    duration: metadata.duration || "",
    sourceType: metadata.sourceType || metadata.source_type || "markdown",
    summary,
    path: filePath,
    headings,
    body: body.trim(),
    plainText,
    metadata,
  };
}

export function renderMarkdownToHtml(markdown) {
  const normalizedMarkdown = String(markdown || "")
    .split(/\r?\n/)
    .map((line) => normalizeKnownHtml(stripLeadingHtmlIndent(line)))
    .join("\n");
  const rendered = marked.parse(normalizedMarkdown, {
    async: false,
    breaks: false,
    gfm: true,
  });
  return sanitizeRenderedHtml(rendered);
}

function splitFrontmatter(markdown) {
  if (!markdown.startsWith("---")) {
    return { frontmatter: "", body: markdown };
  }

  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: "", body: markdown };
  }

  const frontmatter = markdown.slice(3, end).trim();
  const body = markdown.slice(end + 4).replace(/^\r?\n/, "");
  return { frontmatter, body };
}

function parseYamlLikeFrontmatter(frontmatter) {
  const result = {};
  const lines = frontmatter.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    result[key] = parseScalar(rawValue.trim());
  }

  return result;
}

function parseScalar(value) {
  if (!value) return "";

  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((item) => unquote(item.trim()))
      .filter(Boolean);
  }

  return unquote(value);
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value) return [];
  return [String(value)];
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function extractHeadings(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^(#{1,6})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({
      level: match[1].length,
      text: normalizeKnownHtml(match[2]).trim(),
      anchor: slugify(normalizeKnownHtml(match[2])),
    }));
}

function markdownToPlainText(markdown) {
  return decodeHtmlEntities(markdown)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?center\b[^>]*>/gi, " ")
    .replace(/<\/?center\b\s*/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstUsefulParagraph(markdown) {
  const paragraph = markdown
    .split(/\n{2,}/)
    .map((item) => item.replace(/^#+\s+.+$/gm, "").trim())
    .find((item) => item.length > 20);
  return paragraph ? markdownToPlainText(paragraph).slice(0, 160) : "";
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cleanDisplayText(value) {
  return decodeHtmlEntities(value)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/?center\b[^>]*>/gi, " ")
    .replace(/<\/?center\b\s*/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function safeUrl(value) {
  const url = decodeHtmlEntities(String(value || "").trim());
  if (!url) return "";
  if (/^(https?:|data:image\/|\/|#|\.\/|\.\.\/)/i.test(url)) return url;
  return "";
}

function sanitizeRenderedHtml(html) {
  const withoutDangerousBlocks = String(html || "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|textarea|select|option|meta|link|base)\b[^>]*\/?\s*>/gi, "");

  return withoutDangerousBlocks.replace(/<\s*(\/)?\s*([a-z][\w:-]*)([^<>]*?)(\/)?\s*>/gi, (raw, closing, rawName, rawAttributes, selfClosing) => {
    const tagName = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) return "";
    if (closing) return VOID_TAGS.has(tagName) ? "" : `</${tagName}>`;

    const attributes = sanitizeAttributes(tagName, parseAttributes(rawAttributes || ""));
    const attributeText = attributes.length ? ` ${attributes.join(" ")}` : "";
    const voidSuffix = VOID_TAGS.has(tagName) || selfClosing ? " /" : "";
    return `<${tagName}${attributeText}${voidSuffix}>`;
  });
}

const ALLOWED_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "kbd",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);
const VOID_TAGS = new Set(["br", "hr", "img"]);

function parseAttributes(rawAttributes) {
  const attributes = new Map();
  const pattern = /([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(rawAttributes))) {
    const [, rawName, doubleQuoted, singleQuoted, bare] = match;
    attributes.set(rawName.toLowerCase(), decodeHtmlEntities(doubleQuoted ?? singleQuoted ?? bare ?? ""));
  }
  return attributes;
}

function sanitizeAttributes(tagName, attributes) {
  const result = [];
  const push = (name, value) => {
    if (value === "") return;
    result.push(`${name}="${escapeAttribute(value)}"`);
  };
  const pushClass = (extraClass = "") => {
    const className = normalizeClassName([attributes.get("class"), extraClass].filter(Boolean).join(" "));
    push("class", className);
  };

  if (tagName === "a") {
    const href = safeUrl(attributes.get("href"));
    if (href) {
      push("href", href);
      push("target", "_blank");
      push("rel", "noreferrer");
    }
    push("title", attributes.get("title") || "");
    pushClass();
    return result;
  }

  if (tagName === "img") {
    const src = safeUrl(attributes.get("src"));
    if (!src) return [];
    push("src", src);
    push("alt", attributes.get("alt") || "");
    push("title", attributes.get("title") || "");
    push("width", sanitizeDimension(attributes.get("width")));
    push("height", sanitizeDimension(attributes.get("height")));
    pushClass("markdown-media");
    push("loading", "lazy");
    return result;
  }

  if (tagName === "div") {
    const align = normalizeAlignment(attributes.get("align"));
    push("align", align);
    pushClass();
    return result;
  }

  if (tagName === "table") return result;

  if (tagName === "th" || tagName === "td") {
    const align = normalizeAlignment(attributes.get("align"));
    push("align", align);
    return result;
  }

  if (tagName === "code" || tagName === "pre" || tagName === "span") {
    pushClass();
  }

  return result;
}

function normalizeClassName(value) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => /^[A-Za-z0-9_:-]+$/.test(item))
    .join(" ");
}

function normalizeAlignment(value) {
  const align = String(value || "").toLowerCase();
  return ["center", "left", "right"].includes(align) ? align : "";
}

function sanitizeDimension(value) {
  const dimension = String(value || "").trim();
  if (/^\d{1,4}(?:\.\d{1,2})?(?:%|px|rem|em|vw|vh)?$/.test(dimension)) return dimension;
  return "";
}

function normalizeKnownHtml(value) {
  return decodeHtmlEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, "$1")
    .replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, "$1")
    .replace(/<\/?center\b[^>]*>/gi, "")
    .replace(/<\/?(?:span|font|u)\b[^>]*>/gi, "");
}

function stripLeadingHtmlIndent(value) {
  return String(value || "").replace(/^((?:\s|&emsp;|&ensp;|&nbsp;|&#8195;|&#8194;|&#160;)+)(?=\S)/i, "");
}

export function decodeHtmlEntities(value) {
  const namedEntities = {
    amp: "&",
    emsp: "  ",
    ensp: " ",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    apos: "'",
  };

  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, rawName) => {
    const name = rawName.toLowerCase();
    if (name.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    }
    return Object.hasOwn(namedEntities, name) ? namedEntities[name] : entity;
  });
}

function slugFromPath(filePath) {
  return slugify(path.basename(filePath, path.extname(filePath)));
}

function titleFromId(id) {
  return id
    .split("-")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
