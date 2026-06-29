import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { importCourseDirectory, readSourceRegistry, scanCourseDirectory } from "../server/importer.js";

test("course importer scans and indexes lightweight source files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "course-import-"));
  const sourceRoot = path.join(root, "source");
  const knowledgeRoot = path.join(root, "knowledge");
  await fs.mkdir(path.join(sourceRoot, "Part 1"), { recursive: true });
  await fs.mkdir(knowledgeRoot, { recursive: true });

  await fs.writeFile(path.join(sourceRoot, "Part 1", "intro.md"), "# 入门\n\n这是 Markdown 课件。", "utf8");
  await fs.writeFile(path.join(sourceRoot, "Part 1", "note.txt"), "这是一份文本资料。", "utf8");
  await fs.writeFile(
    path.join(sourceRoot, "Part 1", "lesson.ipynb"),
    JSON.stringify({
      cells: [
        { cell_type: "markdown", source: ["# <center>Notebook 课程</center>\n", "&emsp;&emsp;学习目标"] },
        { cell_type: "code", source: ["print('hello')"] },
      ],
    }),
    "utf8",
  );
  await fs.writeFile(
    path.join(sourceRoot, "Part 1", "page.html"),
    "<h1>HTML 课件</h1><p>学习目标</p><ol><li>导入资料</li><li>完成问答</li></ol>",
    "utf8",
  );
  await fs.writeFile(path.join(sourceRoot, "Part 1", "data.zip"), "zip-placeholder", "utf8");

  const scan = await scanCourseDirectory(sourceRoot, { knowledgeRoot });
  assert.equal(scan.summary.indexableFiles, 4);
  assert.equal(scan.summary.assetFiles, 1);

  const result = await importCourseDirectory(sourceRoot, { knowledgeRoot });
  assert.equal(result.stats.imported, 4);
  assert.equal(result.stats.failed, 0);

  const registry = await readSourceRegistry(knowledgeRoot);
  assert.equal(Object.keys(registry.sources).length, 4);

  const generatedRoot = path.join(knowledgeRoot, "generated");
  const generatedModules = await fs.readdir(generatedRoot);
  assert.ok(generatedModules.length >= 1);

  const generatedFiles = await fs.readdir(path.join(generatedRoot, generatedModules[0]));
  const generatedBodies = await Promise.all(
    generatedFiles.map((name) => fs.readFile(path.join(generatedRoot, generatedModules[0], name), "utf8")),
  );
  assert.ok(generatedBodies.some((body) => body.includes("# HTML 课件")));
  assert.ok(generatedBodies.some((body) => body.includes("# Notebook 课程") && body.includes("```python")));
  assert.ok(generatedBodies.every((body) => !body.includes("&emsp;") && !body.includes("<center>")));
});
