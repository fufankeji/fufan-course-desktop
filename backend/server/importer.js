import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { decodeHtmlEntities } from "./markdown.js";

const execFileAsync = promisify(execFile);

const INDEXABLE_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".ipynb", ".html", ".htm", ".pdf"]);
const ASSET_EXTENSIONS = new Set([
  ".7z",
  ".csv",
  ".docx",
  ".jpg",
  ".jpeg",
  ".json",
  ".jsonl",
  ".mp4",
  ".png",
  ".rar",
  ".tar",
  ".tgz",
  ".xlsx",
  ".yaml",
  ".yml",
  ".zip",
]);
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".ipynb_checkpoints",
  "__MACOSX",
  "__pycache__",
  "build",
  "dist",
  "env",
  "node_modules",
  "venv",
]);
const READ_TEXT_LIMIT = 80_000;
const DEFAULT_IMPORT_LIMIT = 1_000;

export async function pickCourseDirectory() {
  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-e", 'POSIX path of (choose folder with prompt "选择课程课件文件夹")'],
      { timeout: 120_000 },
    );
    return stdout.trim().replace(/\/$/, "");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Folder picker failed";
    if (message.includes("User canceled") || message.includes("-128")) {
      throw new Error("已取消选择文件夹。");
    }
    throw new Error(`无法打开系统文件夹选择器：${message}`);
  }
}

export async function getImportStatus(knowledgeRoot) {
  const registry = await readSourceRegistry(knowledgeRoot);
  const sources = Object.values(registry.sources || {});
  return {
    importedSources: sources.length,
    importedPages: sources.filter((source) => source.generatedPath).length,
    roots: Object.values(registry.roots || {}),
    updatedAt: registry.updatedAt || null,
  };
}

export async function scanCourseDirectory(rootPath, options = {}) {
  const root = path.resolve(String(rootPath || ""));
  if (!root || root === path.parse(root).root) {
    throw new Error("请提供有效的课件根目录。");
  }

  const stats = await fs.stat(root);
  if (!stats.isDirectory()) {
    throw new Error("课件路径必须是一个目录。");
  }

  const registry = options.knowledgeRoot ? await readSourceRegistry(options.knowledgeRoot) : { sources: {} };
  const summary = emptySummary();
  const maxDepth = options.maxDepth ?? 10;
  const maxFiles = options.maxFiles ?? 20_000;
  let seenFiles = 0;

  const tree = await scanDirectoryNode(root, root, {
    depth: 0,
    maxDepth,
    maxFiles,
    registry,
    summary,
    seenFilesRef: {
      get value() {
        return seenFiles;
      },
      set value(value) {
        seenFiles = value;
      },
    },
  });

  return {
    rootPath: root,
    tree,
    summary,
  };
}

export async function importCourseDirectory(rootPath, options = {}) {
  const knowledgeRoot = path.resolve(options.knowledgeRoot || "knowledge");
  const generatedRoot = path.join(knowledgeRoot, "generated");
  const root = path.resolve(String(rootPath || ""));
  const scan = await scanCourseDirectory(root, { knowledgeRoot, maxDepth: options.maxDepth, maxFiles: options.maxFiles });
  const files = flattenTree(scan.tree).filter((node) => node.type === "file" && node.importable);
  const limit = options.limit ?? DEFAULT_IMPORT_LIMIT;
  const selectedFiles = files.slice(0, limit);
  const registry = await readSourceRegistry(knowledgeRoot);
  const stats = {
    scanned: files.length,
    selected: selectedFiles.length,
    imported: 0,
    skippedUnchanged: 0,
    failed: 0,
    errors: [],
  };

  await fs.mkdir(generatedRoot, { recursive: true });

  for (const file of selectedFiles) {
    try {
      const sourceKey = sourceKeyForPath(file.path);
      const previous = registry.sources[sourceKey];
      if (!options.force && previous?.signature === file.signature && previous?.generatedPath) {
        stats.skippedUnchanged += 1;
        continue;
      }

      const converted = await convertSourceFile(file, scan.rootPath);
      const moduleDir = sanitizePathPart(converted.moduleId);
      const generatedFile = path.join(generatedRoot, moduleDir, `${converted.id}.md`);
      await fs.mkdir(path.dirname(generatedFile), { recursive: true });
      await fs.writeFile(generatedFile, converted.markdown, "utf8");

      registry.sources[sourceKey] = {
        id: converted.id,
        title: converted.title,
        module: converted.moduleId,
        moduleTitle: converted.moduleTitle,
        rootPath: scan.rootPath,
        relativePath: file.relativePath,
        path: file.path,
        extension: file.extension,
        kind: file.kind,
        signature: file.signature,
        generatedPath: path.relative(knowledgeRoot, generatedFile).replaceAll(path.sep, "/"),
        importedAt: new Date().toISOString(),
      };
      stats.imported += 1;
    } catch (error) {
      stats.failed += 1;
      stats.errors.push({
        path: file.relativePath,
        message: error instanceof Error ? error.message : "Unknown import error",
      });
    }
  }

  registry.roots = registry.roots || {};
  registry.roots[hashText(scan.rootPath)] = {
    rootPath: scan.rootPath,
    importedAt: new Date().toISOString(),
    scanned: stats.scanned,
    imported: stats.imported,
    skippedUnchanged: stats.skippedUnchanged,
  };
  registry.updatedAt = new Date().toISOString();
  await writeSourceRegistry(knowledgeRoot, registry);

  return {
    rootPath: scan.rootPath,
    summary: scan.summary,
    stats,
  };
}

export async function readSourceRegistry(knowledgeRoot) {
  const registryPath = path.join(path.resolve(knowledgeRoot), "source-registry.json");
  try {
    return JSON.parse(await fs.readFile(registryPath, "utf8"));
  } catch {
    return { version: 1, roots: {}, sources: {}, updatedAt: null };
  }
}

async function writeSourceRegistry(knowledgeRoot, registry) {
  const registryPath = path.join(path.resolve(knowledgeRoot), "source-registry.json");
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, `${JSON.stringify({ ...registry, version: 1 }, null, 2)}\n`, "utf8");
}

async function scanDirectoryNode(directory, root, context) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const children = [];

  for (const entry of entries.sort(compareDirent)) {
    if (shouldSkipEntry(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    const relativePath = path.relative(root, fullPath).replaceAll(path.sep, "/");

    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      if (context.depth >= context.maxDepth) continue;
      const child = await scanDirectoryNode(fullPath, root, { ...context, depth: context.depth + 1 });
      if (child.children.length || context.depth < 2) children.push(child);
      continue;
    }

    if (!entry.isFile()) continue;
    context.seenFilesRef.value += 1;
    if (context.seenFilesRef.value > context.maxFiles) break;

    const file = await scanFileNode(fullPath, relativePath, context.registry);
    incrementSummary(context.summary, file);
    if (file.kind !== "ignored") children.push(file);
  }

  return {
    type: "directory",
    name: path.basename(directory),
    path: directory,
    relativePath: path.relative(root, directory).replaceAll(path.sep, "/"),
    children,
    counts: summarizeTree(children),
  };
}

async function scanFileNode(filePath, relativePath, registry) {
  const stats = await fs.stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const kind = kindForExtension(extension);
  const signature = `${stats.size}:${Math.floor(stats.mtimeMs)}`;
  const source = registry.sources?.[sourceKeyForPath(filePath)];
  const status = !source ? "new" : source.signature === signature ? "imported" : "changed";

  return {
    type: "file",
    name: path.basename(filePath),
    path: filePath,
    relativePath,
    extension: extension || "[no-ext]",
    kind,
    importable: kind === "indexable",
    status,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    signature,
  };
}

async function convertSourceFile(file, rootPath) {
  const title = titleFromFile(file.name);
  const topFolder = file.relativePath.split("/")[0] || "导入课件";
  const moduleTitle = topFolder === file.name ? "导入课件" : topFolder;
  const moduleId = `imported-${hashText(moduleTitle).slice(0, 10)}`;
  const id = `source-${hashText(file.path).slice(0, 14)}`;
  const sourceType = sourceTypeForExtension(file.extension);
  const extracted = await extractBody(file, sourceType);
  const summary = summarizeText(extracted.plainText || extracted.body || title);
  const tags = ["导入课件", sourceType, moduleTitle].filter(Boolean);
  const body = [
    `# ${title}`,
    "",
    `> 来源：\`${file.relativePath}\``,
    `> 类型：${sourceType}`,
    "",
    extracted.body.trim(),
  ].join("\n");

  return {
    id,
    title,
    moduleId,
    moduleTitle,
    markdown: [
      "---",
      `id: "${escapeYaml(id)}"`,
      `title: "${escapeYaml(title)}"`,
      'type: "imported"',
      `module: "${escapeYaml(moduleId)}"`,
      `moduleTitle: "${escapeYaml(moduleTitle)}"`,
      `sourceType: "${escapeYaml(sourceType)}"`,
      `sourcePath: "${escapeYaml(file.path)}"`,
      `sourceRoot: "${escapeYaml(rootPath)}"`,
      `relativePath: "${escapeYaml(file.relativePath)}"`,
      `tags: [${tags.map((tag) => `"${escapeYaml(tag)}"`).join(", ")}]`,
      `summary: "${escapeYaml(summary)}"`,
      "---",
      "",
      body,
      "",
    ].join("\n"),
  };
}

async function extractBody(file, sourceType) {
  if (sourceType === "markdown") {
    const body = cleanImportedMarkdown(await readTextFile(file.path));
    return { body, plainText: body };
  }

  if (sourceType === "notebook") {
    return extractNotebook(await readTextFile(file.path, 2_000_000));
  }

  if (sourceType === "html") {
    const body = htmlToMarkdown(await readTextFile(file.path));
    return { body, plainText: body };
  }

  if (sourceType === "pdf") {
    const text = await extractPdfText(file.path);
    if (text) {
      return { body: text, plainText: text };
    }
    return {
      body: [
        "PDF 原文已作为课程资料入口纳入索引。",
        "",
        "当前环境未完成 PDF 文本抽取时，知识库会先保留文件路径、标题和目录上下文；后续可接入 `pdftotext`、MinerU 或 OCR 管线增强正文抽取。",
      ].join("\n"),
      plainText: `${file.name} ${file.relativePath}`,
    };
  }

  const raw = await readTextFile(file.path);
  return { body: raw, plainText: raw };
}

function extractNotebook(raw) {
  const notebook = JSON.parse(raw);
  const chunks = [];

  for (const cell of notebook.cells || []) {
    const source = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source || "");
    if (!source.trim()) continue;

    if (cell.cell_type === "code") {
      chunks.push(["```python", source.trim(), "```"].join("\n"));
    } else {
      chunks.push(cleanImportedMarkdown(source));
    }
  }

  const body = capText(chunks.join("\n\n"), READ_TEXT_LIMIT);
  return { body, plainText: body };
}

async function extractPdfText(filePath) {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", filePath, "-"], {
      maxBuffer: READ_TEXT_LIMIT * 4,
      timeout: 8_000,
    });
    return capText(stdout.replace(/\f/g, "\n").trim(), READ_TEXT_LIMIT);
  } catch {
    return "";
  }
}

async function readTextFile(filePath, limit = READ_TEXT_LIMIT) {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function cleanImportedMarkdown(markdown) {
  return capText(
    decodeHtmlEntities(markdown)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?center\b[^>]*>/gi, "")
      .replace(/<\/?(?:span|font|u)\b[^>]*>/gi, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim(),
    READ_TEXT_LIMIT,
  );
}

function htmlToMarkdown(html) {
  const markdown = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) =>
      ["", "```", stripHtmlInline(code), "```", ""].join("\n"),
    )
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) =>
      ["", "```", stripHtmlInline(code), "```", ""].join("\n"),
    )
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, text) =>
      `\n${"#".repeat(Number(level))} ${stripHtmlInline(text)}\n`,
    )
    .replace(/<img\b([^>]*)>/gi, (_, attrs) => {
      const src = readHtmlAttribute(attrs, "src");
      if (!src) return " ";
      return `\n![${readHtmlAttribute(attrs, "alt")}](${src})\n`;
    })
    .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_, attrs, text) => {
      const label = stripHtmlInline(text);
      const href = readHtmlAttribute(attrs, "href");
      return href && label ? `[${label}](${href})` : label;
    })
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|tr|table|ul|ol|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");

  return capText(
    decodeHtmlEntities(markdown)
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    READ_TEXT_LIMIT,
  );
}

function stripHtmlInline(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function readHtmlAttribute(attrs, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(attrs || "").match(pattern);
  return match ? decodeHtmlEntities(match[2] || match[3] || match[4] || "").trim() : "";
}

function flattenTree(node) {
  if (node.type === "file") return [node];
  return [node, ...node.children.flatMap(flattenTree)];
}

function summarizeTree(children) {
  return children.reduce(
    (counts, child) => {
      counts.total += child.type === "file" ? 1 : child.counts.total;
      counts.indexable += child.type === "file" && child.importable ? 1 : child.counts?.indexable || 0;
      counts.assets += child.type === "file" && child.kind === "asset" ? 1 : child.counts?.assets || 0;
      return counts;
    },
    { total: 0, indexable: 0, assets: 0 },
  );
}

function emptySummary() {
  return { totalFiles: 0, indexableFiles: 0, assetFiles: 0, ignoredFiles: 0, byExtension: {}, byStatus: {} };
}

function incrementSummary(summary, file) {
  summary.totalFiles += 1;
  summary.byExtension[file.extension] = (summary.byExtension[file.extension] || 0) + 1;
  summary.byStatus[file.status] = (summary.byStatus[file.status] || 0) + 1;
  if (file.kind === "indexable") summary.indexableFiles += 1;
  else if (file.kind === "asset") summary.assetFiles += 1;
  else summary.ignoredFiles += 1;
}

function kindForExtension(extension) {
  if (INDEXABLE_EXTENSIONS.has(extension)) return "indexable";
  if (ASSET_EXTENSIONS.has(extension)) return "asset";
  return "ignored";
}

function sourceTypeForExtension(extension) {
  if (extension === ".ipynb") return "notebook";
  if (extension === ".html" || extension === ".htm") return "html";
  if (extension === ".pdf") return "pdf";
  if (extension === ".md" || extension === ".markdown") return "markdown";
  if (extension === ".txt") return "text";
  return extension.replace(/^\./, "") || "file";
}

function compareDirent(a, b) {
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  return a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true });
}

function shouldSkipEntry(name) {
  return name === ".DS_Store" || name.startsWith("._");
}

function sourceKeyForPath(filePath) {
  return hashText(path.resolve(filePath));
}

function hashText(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

function titleFromFile(name) {
  return path.basename(name, path.extname(name)).replace(/[_-]+/g, " ").trim() || name;
}

function sanitizePathPart(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "imported"
  );
}

function summarizeText(value) {
  return capText(
    decodeHtmlEntities(value)
      .replace(/<[^>]+>/g, " ")
      .replace(/[#>*_`[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    160,
  );
}

function capText(value, limit) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}

function escapeYaml(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
}
