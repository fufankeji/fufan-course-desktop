import fs from "node:fs/promises";
import path from "node:path";

export async function listSkillPacks(projectRoot) {
  const runtimePacksRoot = path.join(projectRoot, "runtime-packs");
  let entries = [];
  try {
    entries = await fs.readdir(runtimePacksRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  const packs = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))) {
    if (!entry.isDirectory()) continue;
    const packPath = path.join(runtimePacksRoot, entry.name);
    const manifest = await readPackManifest(packPath);
    if (!manifest) continue;
    packs.push(enrichPack(projectRoot, packPath, manifest));
  }
  return packs;
}

export async function getSkillPack(projectRoot, id) {
  const packs = await listSkillPacks(projectRoot);
  return packs.find((pack) => pack.id === id) || null;
}

async function readPackManifest(packPath) {
  try {
    return JSON.parse(await fs.readFile(path.join(packPath, "skill-manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

function enrichPack(projectRoot, packPath, manifest) {
  const launcher = path.join(projectRoot, "runtime", "bin", "codewhale-tui");
  const firstPrompt = manifest.skills?.[0]?.quickPrompt || "请使用当前课程 Skill 完成快速验证。";
  return {
    ...manifest,
    absolutePath: packPath,
    relativePath: path.relative(projectRoot, packPath).replaceAll(path.sep, "/"),
    files: {
      courseYaml: path.join(packPath, "course.yaml"),
      quickRun: path.join(packPath, "quick-run.md"),
      migrate: path.join(packPath, "migrate.md"),
      codewhaleConfig: path.join(packPath, ".codewhale", "config.toml"),
      launcher,
      tuiBinary: launcher,
    },
    commands: {
      openFolder: `cd ${quoteShell(packPath)}`,
      startTui: [`cd ${quoteShell(packPath)}`, quoteShell(launcher)].join("\n"),
      quickVerify: [`cd ${quoteShell(packPath)}`, `${quoteShell(launcher)} ${quoteShell(firstPrompt)}`].join("\n"),
    },
  };
}

function quoteShell(value) {
  return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}
