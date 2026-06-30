import fs from "node:fs/promises";
import path from "node:path";

import { parseMarkdownPage } from "./markdown.js";

export async function loadCourseWiki(knowledgeRoot, options = {}) {
  const root = path.resolve(knowledgeRoot);
  const manifestPath = path.join(root, "manifest.json");
  const pagesRoot = path.join(root, "pages");
  const generatedRoot = path.join(root, "generated");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const catalog = normalizeCatalog(options.catalog);
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

  const basePageOrder = new Map(manifest.modules.flatMap((module) => module.pageIds).map((id, index) => [id, index]));
  const activePages = pages
    .map((page, fileOrder) => applyPageCatalog(page, catalog, fileOrder))
    .filter(Boolean)
    .filter((page) => !catalog.modulesById.get(page.module)?.deletedAt);
  const moduleDefs = buildModuleDefs(manifest, activePages, catalog);
  const normalizedModules = [...moduleDefs.values()]
    .sort(compareModules)
    .map((module) => ({
      ...module,
      pages: activePages.filter((page) => page.module === module.id).sort((a, b) => comparePages(a, b, basePageOrder)),
    }));
  const orderedPages = normalizedModules.flatMap((module) => module.pages);
  const pageById = new Map(orderedPages.map((page) => [page.id, page]));

  return {
    manifest: {
      ...manifest,
      modules: normalizedModules.map((module) => ({
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
    pages: orderedPages,
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

function normalizeCatalog(catalog = {}) {
  return {
    modulesById: new Map((catalog.modules || []).map(normalizeCatalogModule).filter(Boolean).map((item) => [item.id, item])),
    pagesById: new Map((catalog.pages || []).map(normalizeCatalogPage).filter(Boolean).map((item) => [item.id, item])),
  };
}

function normalizeCatalogModule(module) {
  const id = normalizeText(module?.id);
  if (!id) return null;
  return {
    id,
    title: normalizeText(module.title),
    sortOrder: normalizeSortOrder(module.sortOrder),
    deletedAt: normalizeText(module.deletedAt),
  };
}

function normalizeCatalogPage(page) {
  const id = normalizeText(page?.id);
  if (!id) return null;
  return {
    id,
    moduleId: normalizeText(page.moduleId),
    title: normalizeText(page.title),
    sortOrder: normalizeSortOrder(page.sortOrder),
    deletedAt: normalizeText(page.deletedAt),
  };
}

function applyPageCatalog(page, catalog, fileOrder) {
  const override = catalog.pagesById.get(page.id);
  if (override?.deletedAt) return null;

  return {
    ...page,
    module: override?.moduleId || page.module,
    title: override?.title || page.title,
    catalogSortOrder: override?.sortOrder ?? null,
    fileOrder,
  };
}

function buildModuleDefs(manifest, pages, catalog) {
  const modules = new Map();

  for (const [baseOrder, module] of manifest.modules.entries()) {
    const override = catalog.modulesById.get(module.id);
    if (override?.deletedAt) continue;

    modules.set(module.id, {
      ...module,
      title: override?.title || module.title,
      catalogSortOrder: override?.sortOrder ?? null,
      baseOrder,
    });
  }

  for (const page of pages) {
    if (modules.has(page.module)) continue;

    const override = catalog.modulesById.get(page.module);
    if (override?.deletedAt) continue;

    modules.set(page.module, {
      id: page.module,
      title: override?.title || page.metadata.moduleTitle || "导入课件",
      theme: "从本地课件目录导入的课程知识页",
      level: "导入",
      pageIds: [],
      catalogSortOrder: override?.sortOrder ?? null,
      baseOrder: manifest.modules.length + modules.size,
    });
  }

  return modules;
}

function compareModules(a, b) {
  const sortA = a.catalogSortOrder ?? a.baseOrder ?? Number.MAX_SAFE_INTEGER;
  const sortB = b.catalogSortOrder ?? b.baseOrder ?? Number.MAX_SAFE_INTEGER;
  return sortA - sortB || a.title.localeCompare(b.title, "zh-Hans-CN") || a.id.localeCompare(b.id);
}

function comparePages(a, b, basePageOrder) {
  const sortA = a.catalogSortOrder ?? basePageOrder.get(a.id) ?? a.fileOrder ?? Number.MAX_SAFE_INTEGER;
  const sortB = b.catalogSortOrder ?? basePageOrder.get(b.id) ?? b.fileOrder ?? Number.MAX_SAFE_INTEGER;
  return sortA - sortB || a.title.localeCompare(b.title, "zh-Hans-CN") || a.id.localeCompare(b.id);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSortOrder(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}
