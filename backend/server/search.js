export function searchPages(pages, query, options = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const filteredPages = options.moduleId ? pages.filter((page) => page.module === options.moduleId) : pages;

  return filteredPages
    .map((page) => {
      const score =
        scoreField(page.title, tokens, 8) +
        scoreField(page.tags.join(" "), tokens, 6) +
        scoreField(page.module, tokens, 4) +
        scoreField(page.summary, tokens, 3) +
        scoreField(page.plainText, tokens, 1);

      return {
        ...summarizePage(page),
        score,
        snippet: buildSnippet(page, tokens),
      };
    })
    .filter((page) => page.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "zh-Hans-CN"))
    .slice(0, options.limit ?? 8);
}

export function tokenize(input) {
  const normalized = String(input || "").toLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9+_.-]*/g) || [];
  const cjk = [...normalized.matchAll(/[\p{Script=Han}]{1,}/gu)].flatMap(([segment]) => {
    const chars = Array.from(segment);
    const tokens = [...chars];
    for (let index = 0; index < chars.length - 1; index += 1) {
      tokens.push(chars[index] + chars[index + 1]);
    }
    return tokens;
  });

  return [...new Set([...latin, ...cjk].filter((token) => token.length > 0))];
}

export function summarizePage(page) {
  return {
    id: page.id,
    title: page.title,
    type: page.type,
    module: page.module,
    tags: page.tags,
    difficulty: page.difficulty,
    duration: page.duration,
    summary: page.summary,
  };
}

function scoreField(value, tokens, weight) {
  const field = String(value || "").toLowerCase();
  return tokens.reduce((score, token) => {
    if (!field.includes(token)) return score;
    const exactBonus = field === token ? 2 : 1;
    return score + weight * exactBonus;
  }, 0);
}

function buildSnippet(page, tokens) {
  const text = page.plainText || page.summary || "";
  const lower = text.toLowerCase();
  const token = tokens.find((candidate) => lower.includes(candidate));
  if (!token) return page.summary || text.slice(0, 160);

  const index = Math.max(0, lower.indexOf(token) - 48);
  const snippet = text.slice(index, index + 180).trim();
  return `${index > 0 ? "..." : ""}${snippet}${index + 180 < text.length ? "..." : ""}`;
}
