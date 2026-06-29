import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../server/app.js";
import { listSkillPacks } from "../server/skill-packs.js";

const projectRoot = new URL("..", import.meta.url).pathname;

async function request(app, path) {
  const response = await app.handleRequest(new Request(`http://local.test${path}`));
  const json = await response.json();
  return { response, json };
}

test("listSkillPacks reads the context engineering runtime pack", async () => {
  const packs = await listSkillPacks(projectRoot);
  const pack = packs.find((item) => item.id === "context-engineering");

  assert.ok(pack);
  assert.equal(pack.skills[0].id, "context-compression");
  assert.match(pack.commands.startTui, /runtime\/bin\/codewhale-tui/);
  assert.match(pack.commands.quickVerify, /context-compression Skill/);
  assert.match(pack.files.codewhaleConfig, /\.codewhale\/config\.toml$/);
  assert.match(pack.files.tuiBinary, /runtime\/bin\/codewhale-tui$/);
});

test("API exposes skill runtime packs", async () => {
  const app = await createApp({ knowledgeRoot: "knowledge" });

  const result = await request(app, "/api/skill-packs");

  assert.equal(result.response.status, 200);
  assert.ok(result.json.packs.some((pack) => pack.id === "context-engineering"));
});
