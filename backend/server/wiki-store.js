import fs from "node:fs/promises";
import path from "node:path";

import { parseMarkdownPage } from "./markdown.js";

export async function loadCourseWiki(knowledgeRoot, options = {}) {
  const root = path.resolve(knowledgeRoot);
  const manifestPath = path.join(root, "manifest.json");
  const pagesRoot = path.join(root, "pages");
  const generatedRoot = path.join(root, "generated");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const includeSeedPages = options.includeSeedPages ?? manifest.includeSeedPages !== false;
  const pageFiles = [
    ...(includeSeedPages ? await listMarkdownFiles(pagesRoot) : []),
    ...(await listMarkdownFiles(generatedRoot)),
  ];
  const pages = [];

  for (const filePath of pageFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    const relativePath = path.relative(root, filePath).replaceAll(path.sep, "/");
    pages.push(parseMarkdownPage(relativePath, raw));
  }

  const pageById = new Map(pages.map((page) => [page.id, page]));
  const normalizedModules = manifest.modules.map((module) => ({
    ...module,
    pages: module.pageIds.map((pageId) => pageById.get(pageId)).filter(Boolean),
  }));
  const knownModuleIds = new Set(normalizedModules.map((module) => module.id));
  const generatedModules = groupGeneratedPages(pages, knownModuleIds);

  const pageOrder = new Map(manifest.modules.flatMap((module) => module.pageIds).map((id, index) => [id, index]));
  pages.sort((a, b) => (pageOrder.get(a.id) ?? 9999) - (pageOrder.get(b.id) ?? 9999));

  return {
    manifest: {
      ...manifest,
      modules: [...normalizedModules, ...generatedModules].map((module) => ({
        id: module.id,
        title: module.title,
        theme: module.theme,
        level: module.level,
        pages: module.pages.map((page) => ({
          id: page.id,
          title: page.title,
          type: page.type,
          duration: page.duration,
          difficulty: page.difficulty,
        })),
      })),
    },
    pages,
    getPage(id) {
      return pageById.get(id) || null;
    },
  };
}

async function listMarkdownFiles(directory) {
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function groupGeneratedPages(pages, knownModuleIds) {
  const groups = new Map();

  for (const page of pages) {
    if (!page.id.startsWith("source-")) continue;
    if (knownModuleIds.has(page.module)) continue;

    if (!groups.has(page.module)) {
      groups.set(page.module, {
        id: page.module,
        title: page.metadata.moduleTitle || "导入课件",
        theme: "从本地课件目录导入的课程知识页",
        level: "导入",
        pages: [],
      });
    }

    groups.get(page.module).pages.push(page);
  }

  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
}
