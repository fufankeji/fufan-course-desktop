import { FitAddon } from "./vendor/xterm/addon-fit.mjs";
import { Terminal } from "./vendor/xterm/xterm.mjs";

const TERMINAL_FALLBACK_COLS = 100;
const TERMINAL_FALLBACK_ROWS = 30;
const CHAT_HISTORY_LIMIT = 8;

const state = {
  manifest: null,
  pages: [],
  skillPacks: [],
  currentPage: null,
  currentPageId: null,
  currentModuleId: null,
  messages: [],
  expandedModules: new Set(),
  catalogExpanded: true,
  lastScan: null,
  modelSettings: null,
  modelLastTest: null,
  modelConfigRequired: false,
  quickToolTab: null,
  selectedCourseText: "",
  chatContextMode: "",
  chatComposing: false,
  knowledgeDrag: null,
  knowledgeEditor: null,
  terminal: {
    sessionId: null,
    eventSource: null,
    packId: null,
    pageId: null,
    skillId: null,
    bootstrapPrompt: "",
    xterm: null,
    fitAddon: null,
    resizeObserver: null,
    resizeTimer: null,
    lastSize: { cols: TERMINAL_FALLBACK_COLS, rows: TERMINAL_FALLBACK_ROWS },
  },
};

const elements = {
  subtitle: document.querySelector("#course-subtitle"),
  pageCount: document.querySelector("#page-count"),
  moduleList: document.querySelector("#module-list"),
  pageType: document.querySelector("#page-type"),
  pageDifficulty: document.querySelector("#page-difficulty"),
  pageDuration: document.querySelector("#page-duration"),
  pageTitle: document.querySelector("#page-title"),
  pageSummary: document.querySelector("#page-summary"),
  pageTags: document.querySelector("#page-tags"),
  skillPanel: document.querySelector("#skill-panel"),
  pageContent: document.querySelector("#page-content"),
  selectionAsk: document.querySelector("#selection-ask"),
  readerContext: document.querySelector("#reader-context"),
  copyAgentPrompt: document.querySelector("#copy-agent-prompt"),
  searchInput: document.querySelector("#global-search"),
  searchClear: document.querySelector("#search-clear"),
  searchResults: document.querySelector("#search-results"),
  modelStatus: document.querySelector("#model-status"),
  modelConfigOpen: document.querySelector("#model-config-open"),
  modelConfigOverlay: document.querySelector("#model-config-overlay"),
  modelConfigTitle: document.querySelector("#model-config-title"),
  modelConfigDescription: document.querySelector("#model-config-description"),
  modelConfigClose: document.querySelector("#model-config-close"),
  modelConfigForm: document.querySelector("#model-config-form"),
  configProvider: document.querySelector("#config-provider"),
  configBaseUrl: document.querySelector("#config-base-url"),
  configModel: document.querySelector("#config-model"),
  configApiKey: document.querySelector("#config-api-key"),
  configStatus: document.querySelector("#config-status"),
  configTest: document.querySelector("#config-test"),
  configSave: document.querySelector("#config-save"),
  importToggle: document.querySelector("#import-toggle"),
  importPanel: document.querySelector("#import-panel"),
  collapseImport: document.querySelector("#collapse-import"),
  importRoot: document.querySelector("#import-root"),
  pickFolder: document.querySelector("#pick-folder"),
  scanCourse: document.querySelector("#scan-course"),
  runImport: document.querySelector("#run-import"),
  importSummary: document.querySelector("#import-summary"),
  importTree: document.querySelector("#import-tree"),
  chatLog: document.querySelector("#chat-log"),
  chatForm: document.querySelector("#chat-form"),
  chatInput: document.querySelector("#chat-input"),
  chatExample: document.querySelector("#chat-example"),
  quickToolDock: document.querySelector("#quick-tool-dock"),
  quickToolPanel: document.querySelector("#quick-tool-panel"),
  quickToolTitle: document.querySelector("#quick-tool-title"),
  quickToolBody: document.querySelector("#quick-tool-body"),
  quickToolClose: document.querySelector("#quick-tool-close"),
  terminalOverlay: document.querySelector("#terminal-overlay"),
  terminalTitle: document.querySelector("#terminal-title"),
  terminalStatus: document.querySelector("#terminal-status"),
  terminalEmulator: document.querySelector("#terminal-emulator"),
  terminalContext: document.querySelector("#terminal-context"),
  terminalVerify: document.querySelector("#terminal-verify"),
  terminalStop: document.querySelector("#terminal-stop"),
  terminalClose: document.querySelector("#terminal-close"),
};

await boot();

async function boot() {
  const [, modelPayload] = await Promise.all([refreshWikiState(), refreshRuntimeStatus(), refreshSkillPacks()]);
  wireEvents();
  promptForModelConfigIfRequired(modelPayload);

  const firstPageId = state.manifest.modules[0]?.pages[0]?.id;
  if (firstPageId) {
    await loadPage(firstPageId);
  } else {
    addMessage("assistant", "还没有导入课件。导入课程目录后，可以按课件上下文继续问答。");
  }
}

function wireEvents() {
  elements.searchInput.addEventListener("input", debounce(handleSearch, 180));
  elements.searchClear.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.searchResults.classList.add("hidden");
  });
  elements.chatExample.addEventListener("click", () => {
    state.chatContextMode = "";
    elements.chatInput.value = "我想做企业级检索增强项目，应该先学什么？";
    elements.chatInput.focus();
  });
  elements.modelConfigOpen.addEventListener("click", openModelConfig);
  elements.modelConfigClose.addEventListener("click", closeModelConfig);
  elements.modelConfigOverlay.addEventListener("click", (event) => {
    if (event.target === elements.modelConfigOverlay) closeModelConfig();
  });
  elements.modelConfigForm.addEventListener("submit", handleModelConfigSave);
  elements.configTest.addEventListener("click", handleModelConfigTest);
  elements.copyAgentPrompt.addEventListener("click", copyCurrentPagePrompt);
  elements.chatForm.addEventListener("submit", handleChatSubmit);
  elements.chatInput.addEventListener("keydown", handleChatInputKeydown);
  elements.chatInput.addEventListener("compositionstart", () => {
    state.chatComposing = true;
  });
  elements.chatInput.addEventListener("compositionend", () => {
    state.chatComposing = false;
  });
  elements.chatInput.addEventListener("input", handleChatInputChange);
  elements.pageContent.addEventListener("mouseup", handleCourseSelectionChange);
  elements.pageContent.addEventListener("keyup", handleCourseSelectionChange);
  elements.selectionAsk.addEventListener("click", handleSelectionAskClick);
  elements.moduleList.addEventListener("click", handleKnowledgeTreeAction);
  elements.moduleList.addEventListener("submit", handleKnowledgeEditorSubmit);
  elements.moduleList.addEventListener("keydown", handleKnowledgeEditorKeydown);
  elements.moduleList.addEventListener("dragstart", handleKnowledgeDragStart);
  elements.moduleList.addEventListener("dragover", handleKnowledgeDragOver);
  elements.moduleList.addEventListener("dragleave", handleKnowledgeDragLeave);
  elements.moduleList.addEventListener("drop", handleKnowledgeDrop);
  elements.moduleList.addEventListener("dragend", handleKnowledgeDragEnd);
  document.addEventListener("mousedown", handleDocumentMouseDown);
  window.addEventListener("resize", hideSelectionAsk);
  elements.importToggle.addEventListener("click", toggleImportPanel);
  elements.collapseImport.addEventListener("click", hideImportPanel);
  elements.pickFolder.addEventListener("click", handlePickFolder);
  elements.scanCourse.addEventListener("click", handleScanCourse);
  elements.runImport.addEventListener("click", handleImportCourse);
  elements.skillPanel.addEventListener("click", handleSkillPanelClick);
  elements.quickToolDock.addEventListener("click", handleQuickToolClick);
  elements.quickToolClose.addEventListener("click", closeQuickToolPanel);
  elements.quickToolBody.addEventListener("click", handleQuickToolBodyClick);
  elements.quickToolBody.addEventListener("input", handleQuickToolBodyInput);
  elements.terminalVerify.addEventListener("click", handleTerminalVerify);
  elements.terminalStop.addEventListener("click", stopTerminalSession);
  elements.terminalClose.addEventListener("click", closeTerminalPanel);
}

async function refreshWikiState(options = {}) {
  const [manifest, pagesPayload] = await Promise.all([fetchJson("/api/manifest"), fetchJson("/api/pages")]);
  const previousModuleId = state.currentModuleId;
  state.manifest = manifest;
  state.pages = pagesPayload.pages;
  state.currentModuleId = manifest.modules.some((module) => module.id === previousModuleId)
    ? previousModuleId
    : manifest.modules[0]?.id || null;
  state.expandedModules = new Set([
    ...state.expandedModules,
    ...manifest.modules.map((module) => module.id),
  ]);

  elements.subtitle.textContent = manifest.subtitle;
  elements.pageCount.textContent = `${state.pages.length} 页`;
  renderModules();

  if (options.loadFirst && manifest.modules[0]?.pages[0]?.id) {
    await loadPage(manifest.modules[0].pages[0].id);
  }
}

async function refreshRuntimeStatus() {
  const [modelPayload, importStatus] = await Promise.all([fetchJson("/api/settings/model"), fetchJson("/api/import/status")]);
  state.modelSettings = modelPayload.settings;
  state.modelLastTest = modelPayload.lastTest?.llm || null;
  renderTopModelStatus(modelPayload);

  if (importStatus.importedSources) {
    elements.importSummary.textContent = `已导入 ${importStatus.importedSources} 个来源，生成 ${importStatus.importedPages} 个知识页。`;
  }

  return modelPayload;
}

function renderTopModelStatus(payload) {
  const llm = payload.llm || {};
  const terminal = payload.terminal || {};
  const lastLlmTest = payload.lastTest?.llm || null;
  if (!llm.configured) {
    setTopModelStatus("error", "模型未配置");
    return;
  }

  if (!terminal.available) {
    setTopModelStatus("warning", "模型已保存 · 智能体环境待检查");
    return;
  }

  if (lastLlmTest?.ok) {
    setTopModelStatus("ok", `模型连接正常 · ${lastLlmTest.model || llm.model || state.modelSettings?.model || ""}`);
    return;
  }

  if (lastLlmTest && lastLlmTest.ok === false) {
    setTopModelStatus("error", lastLlmTest.message || "模型连接失败");
    return;
  }

  setTopModelStatus("warning", `模型配置已保存 · 待测试 · ${llm.model || state.modelSettings?.model || ""}`);
}

async function refreshSkillPacks() {
  const payload = await fetchJson("/api/skill-packs");
  state.skillPacks = payload.packs || [];
}

function renderModules() {
  elements.moduleList.innerHTML = "";

  const section = document.createElement("section");
  section.className = `learn-section ${state.catalogExpanded ? "" : "collapsed"}`;

  const sectionHead = document.createElement("div");
  sectionHead.className = "learn-section-head";
  sectionHead.innerHTML = `
    <span class="section-label">课程知识库<span class="section-progress">${state.pages.length}</span></span>
    <span class="learn-toggle-icon" aria-hidden="true"></span>
  `;
  sectionHead.addEventListener("click", () => {
    state.catalogExpanded = !state.catalogExpanded;
    renderModules();
  });

  const sectionBody = document.createElement("div");
  sectionBody.className = "learn-section-body";

  const tree = document.createElement("div");
  tree.className = "learn-tree";

  for (const module of state.manifest.modules) {
    const expanded = state.expandedModules.has(module.id);
    const activeModule = module.id === state.currentModuleId;
    const wrapper = document.createElement("section");
    wrapper.className = `learn-tree-node ${expanded ? "" : "is-collapsed"} ${activeModule ? "has-active" : ""}`;
    wrapper.dataset.moduleId = module.id;

    const row = document.createElement("div");
    row.className = "learn-tree-row learn-phase-row";
    row.dataset.knowledgeType = "module";
    row.dataset.moduleId = module.id;
    row.draggable = true;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "learn-tree-toggle";
    toggle.setAttribute("aria-label", expanded ? "收起模块" : "展开模块");
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.innerHTML = '<span class="learn-tree-chevron" aria-hidden="true"></span>';
    toggle.addEventListener("click", () => toggleModule(module.id));

    const title = document.createElement("button");
    title.type = "button";
    title.className = "learn-tree-link learn-phase-link";
    title.title = module.theme;
    title.innerHTML = `
      <span>${escapeHtml(module.title)}<em class="phase-progress">${module.pages.length}</em></span>
      <small>${escapeHtml(module.level)}</small>
    `;
    title.addEventListener("click", () => toggleModule(module.id));

    const actions = document.createElement("div");
    actions.className = "knowledge-actions";
    actions.innerHTML = `
      <button type="button" class="knowledge-action" data-knowledge-action="rename-module" data-module-id="${escapeAttribute(module.id)}" title="重命名目录" aria-label="重命名目录">${knowledgeIcon("edit")}</button>
      <button type="button" class="knowledge-action danger" data-knowledge-action="delete-module" data-module-id="${escapeAttribute(module.id)}" title="删除目录" aria-label="删除目录">${knowledgeIcon("trash")}</button>
    `;

    row.append(toggle, title, actions);
    wrapper.append(row);
    if (knowledgeEditorMatches("module", module.id)) {
      wrapper.append(createKnowledgeEditorPanel({ type: "module", id: module.id, title: module.title, count: module.pages.length }));
    }

    const children = document.createElement("div");
    children.className = "learn-tree-children";

    for (const page of module.pages) {
      const row = document.createElement("div");
      row.className = `learn-tree-row learn-lesson-row learn-lesson ${page.id === state.currentPageId ? "active" : ""}`;
      row.dataset.knowledgeType = "page";
      row.dataset.pageId = page.id;
      row.dataset.moduleId = module.id;
      row.draggable = true;

      const spacer = document.createElement("span");
      spacer.className = "learn-tree-toggle-spacer";
      spacer.setAttribute("aria-hidden", "true");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "learn-tree-link learn-lesson-link";
      button.innerHTML = `<span>${escapeHtml(page.title)}</span>`;
      button.addEventListener("click", () => loadPage(page.id));

      const actions = document.createElement("div");
      actions.className = "knowledge-actions";
      actions.innerHTML = `
        <button type="button" class="knowledge-action" data-knowledge-action="rename-page" data-page-id="${escapeAttribute(page.id)}" title="重命名课件" aria-label="重命名课件">${knowledgeIcon("edit")}</button>
        <button type="button" class="knowledge-action danger" data-knowledge-action="delete-page" data-page-id="${escapeAttribute(page.id)}" title="删除课件" aria-label="删除课件">${knowledgeIcon("trash")}</button>
      `;

      row.append(spacer, button, actions);
      children.append(row);
      if (knowledgeEditorMatches("page", page.id)) {
        children.append(createKnowledgeEditorPanel({ type: "page", id: page.id, title: page.title, count: 0 }));
      }
    }

    wrapper.append(children);
    tree.append(wrapper);
  }

  sectionBody.append(tree);
  section.append(sectionHead, sectionBody);
  elements.moduleList.append(section);
}

async function loadPage(pageId) {
  const payload = await fetchJson(`/api/pages/${encodeURIComponent(pageId)}`);
  const page = payload.page;
  state.currentPage = page;
  state.currentPageId = page.id;
  state.currentModuleId = page.module;

  elements.pageType.textContent = labelForType(page.type);
  elements.pageDifficulty.textContent = page.difficulty || "-";
  elements.pageDuration.textContent = page.duration || "-";
  elements.pageTitle.textContent = page.title;
  elements.pageSummary.textContent = page.summary;
  elements.pageTags.innerHTML = page.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  renderSkillPanel(page);
  elements.pageContent.innerHTML = page.html;
  elements.readerContext.textContent = page.title;
  hideSelectionAsk();

  if (!state.expandedModules.has(page.module)) {
    state.expandedModules.add(page.module);
    renderModules();
  }

  updateActiveNav(page);
  await loadChatHistory(page.id);
  if (state.quickToolTab) renderQuickToolPanel(state.quickToolTab);
}

function renderSkillPanel(page) {
  const packs = matchingSkillPacks(page);
  if (!packs.length) {
    elements.skillPanel.classList.add("hidden");
    elements.skillPanel.innerHTML = "";
    return;
  }

  elements.skillPanel.classList.remove("hidden");
  elements.skillPanel.innerHTML = packs
    .map((pack) => {
      const skills = (pack.skills || [])
        .map(
          (skill) => `
            <div class="skill-card">
              <div class="skill-card-mark">能</div>
              <div class="skill-card-main">
                <span class="skill-label">赋范智能体能力包</span>
                <strong>${escapeHtml(skill.name)}</strong>
                <p>${escapeHtml(skill.description)}</p>
                <div class="skill-meta-row">
                  <span>适配两大智能体流派</span>
                  <code>${escapeHtml(skill.id)}</code>
                </div>
              </div>
              <div class="skill-card-actions">
                <button type="button" data-copy="${escapeAttribute(skill.quickPrompt)}" data-done="已复制提示词">复制验证提示词</button>
                <button type="button" data-terminal-pack="${escapeAttribute(pack.id)}" data-terminal-skill="${escapeAttribute(skill.id)}">打开赋范智能体</button>
                <button type="button" data-copy="${escapeAttribute(migrationText(pack, skill))}" data-done="已复制迁移说明">迁移说明</button>
              </div>
            </div>
          `,
        )
        .join("");

      return `
        <div class="skill-pack">
          <div class="skill-pack-head">
            <div>
              <span class="eyebrow">课件配套能力包</span>
              <h3>${escapeHtml(pack.title)}</h3>
            </div>
            <span class="skill-pack-chip">当前课件可用</span>
          </div>
          ${skills}
        </div>
      `;
    })
    .join("");
}

function matchingSkillPacks(page) {
  if (!state.skillPacks.length) return [];
  return state.skillPacks.filter((pack) => skillPackMatchesPage(pack, page));
}

function skillPackMatchesPage(pack, page) {
  if (pack.defaultForImportedPages && page.path?.startsWith("generated/")) return true;

  const text = [
    page.title,
    page.summary,
    page.module,
    page.path,
    page.metadata?.relativePath,
    ...(page.tags || []),
  ]
    .filter(Boolean)
    .join(" ");

  const terms = [
    ...(pack.coursePathHint || "").split(/[\\/]/),
    ...(pack.courseMatchers || []),
    ...(pack.lessonMatchers || []),
    ...(pack.skills || []).flatMap((skill) => skill.lessonMatchers || []),
  ]
    .map((item) => String(item || "").trim())
    .filter((item) => item.length >= 2);

  return terms.some((term) => text.includes(term));
}

async function handleSkillPanelClick(event) {
  const terminalButton = event.target.closest("button[data-terminal-pack]");
  if (terminalButton) {
    await openTerminalPanel(terminalButton.dataset.terminalPack, terminalButton.dataset.terminalSkill);
    return;
  }

  const button = event.target.closest("button[data-copy]");
  if (!button) return;
  const original = button.textContent;
  try {
    await writeClipboardWithTimeout(button.dataset.copy, 500);
    button.textContent = button.dataset.done || "已复制";
    setTimeout(() => {
      button.textContent = original;
    }, 1300);
  } catch {
    elements.chatInput.value = button.dataset.copy;
    elements.chatInput.focus();
  }
}

async function openTerminalPanel(packId, skillId) {
  if (!(await ensureTerminalModelReady())) return;

  const pageId = state.currentPageId;
  const pageTitle = elements.pageTitle.textContent || "当前课件";
  elements.terminalOverlay.classList.remove("hidden");
  elements.terminalTitle.textContent = `${pageTitle} · ${skillId || "能力包"} · 赋范智能体`;
  elements.terminalStatus.textContent = "正在启动";
  elements.terminalContext.innerHTML = renderTerminalContextCards({
    pageTitle,
    skillId,
    status: "starting",
  });
  resetTerminalBootstrap();
  elements.terminalVerify.disabled = true;
  initializeTerminal();
  detachTerminalEventStream();
  resetTerminalEmulator();
  setTerminalInputEnabled(false);
  writeTerminalLocalLine(`正在为《${pageTitle}》启动赋范智能体...`);
  const terminalSize = fitTerminalToPanel();

  try {
    const payload = await fetchJson("/api/terminal/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packId, skillId, pageId, cols: terminalSize.cols, rows: terminalSize.rows }),
    });

    state.terminal.sessionId = payload.session.id;
    state.terminal.packId = packId;
    state.terminal.pageId = payload.session.page?.id || pageId;
    state.terminal.skillId = payload.session.skill?.id || skillId;
    state.terminal.bootstrapPrompt = payload.session.bootstrapPrompt || "";
    elements.terminalStatus.textContent = "就绪";
    elements.terminalTitle.textContent = [
      payload.session.page?.title || pageTitle,
      payload.session.skill?.name || skillId || "能力包",
      "赋范智能体",
    ]
      .filter(Boolean)
      .join(" · ");
    elements.terminalVerify.disabled = !state.terminal.bootstrapPrompt;
    elements.terminalContext.innerHTML = renderTerminalContextCards({
      pageTitle: payload.session.page?.title || pageTitle,
      skillId: payload.session.skill?.id || skillId,
      skillName: payload.session.skill?.name,
      contextPath: payload.session.relativeContextFile,
      status: "ready",
    });
    connectTerminalEvents(payload.session.id);
    setTerminalInputEnabled(true);
    requestAnimationFrame(() => {
      fitTerminalToPanel();
      state.terminal.xterm?.focus();
    });
  } catch (error) {
    if (handleTerminalModelConfigError(error)) return;
    elements.terminalStatus.textContent = "异常";
    elements.terminalContext.textContent = "控制台启动失败。";
    writeTerminalLocalLine(`启动失败：${error.message}`);
  }
}

async function ensureTerminalModelReady() {
  const payload = await refreshRuntimeStatus();
  const settings = payload.settings || {};
  const lastTest = payload.lastTest?.llm || null;
  if (settings.configured && lastTest?.ok) return true;

  openModelConfig({ required: true, reason: "terminal" });
  renderConfigStatus({
    llm: {
      ok: false,
      message: settings.configured
        ? "DeepSeek API Key 尚未通过连接测试。请先验证并保存，再打开赋范智能体。"
        : "请先配置并验证 DeepSeek API Key，再打开赋范智能体。",
    },
    terminal: {
      ok: false,
      message: "赋范智能体控制台会读取同一份模型配置，不在 TUI 内单独输入密钥。",
    },
  });
  return false;
}

function handleTerminalModelConfigError(error) {
  if (!["MODEL_CONFIG_REQUIRED", "MODEL_CONFIG_UNVERIFIED"].includes(error.code)) return false;
  elements.terminalOverlay.classList.add("hidden");
  openModelConfig({ required: true, reason: "terminal" });
  renderConfigStatus({
    llm: { ok: false, message: error.message },
    terminal: { ok: false, message: "赋范智能体控制台会读取同一份模型配置，不在 TUI 内单独输入密钥。" },
  });
  return true;
}

function connectTerminalEvents(sessionId) {
  if (state.terminal.eventSource) {
    state.terminal.eventSource.close();
  }

  const source = new EventSource(`/api/terminal/sessions/${encodeURIComponent(sessionId)}/events`);
  state.terminal.eventSource = source;
  source.addEventListener("terminal", (event) => {
    const payload = JSON.parse(event.data);
    if (state.terminal.sessionId && sessionId !== state.terminal.sessionId) return;
    if (payload.type === "hello") {
      syncTerminalSession(payload.session);
    } else if (payload.type === "output") {
      writeTerminalOutput(decodeTerminalOutput(payload.data));
    } else if (payload.type === "status") {
      elements.terminalStatus.textContent = terminalDisplayStatus(payload.status);
      syncTerminalSession(payload.session);
    } else if (payload.type === "exit") {
      elements.terminalStatus.textContent = `已退出 ${payload.code ?? ""}`.trim();
      state.terminal.sessionId = null;
      state.terminal.packId = null;
      state.terminal.pageId = null;
      state.terminal.skillId = null;
      elements.terminalVerify.disabled = true;
      setTerminalInputEnabled(false);
      source.close();
      if (state.terminal.eventSource === source) state.terminal.eventSource = null;
    } else if (payload.type === "error") {
      elements.terminalStatus.textContent = "异常";
      writeTerminalLocalLine(payload.message || "终端进程异常。");
    }
  });
  source.onerror = () => {
    elements.terminalStatus.textContent = "连接断开";
  };
}

async function handleTerminalVerify() {
  if (!state.terminal.sessionId || !state.terminal.bootstrapPrompt) return;
  await submitTerminalText(state.terminal.bootstrapPrompt);
}

async function submitTerminalText(value) {
  if (!state.terminal.sessionId) return;
  await sendTerminalInput(String(value || ""));
  await sleep(80);
  await sendTerminalInput("\r");
  state.terminal.xterm?.focus();
}

async function sendTerminalInput(data) {
  if (!state.terminal.sessionId) return;
  try {
    await fetchJson(`/api/terminal/sessions/${encodeURIComponent(state.terminal.sessionId)}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
    });
  } catch (error) {
    writeTerminalLocalLine(`发送失败：${error.message}`);
  }
}

async function stopTerminalSession() {
  if (!state.terminal.sessionId) {
    if (state.terminal.eventSource) {
      state.terminal.eventSource.close();
      state.terminal.eventSource = null;
    }
    setTerminalInputEnabled(false);
    return;
  }
  const sessionId = state.terminal.sessionId;
  state.terminal.sessionId = null;
  state.terminal.packId = null;
  state.terminal.pageId = null;
  state.terminal.skillId = null;
  resetTerminalBootstrap();
  setTerminalInputEnabled(false);
  elements.terminalVerify.disabled = true;
  if (state.terminal.eventSource) {
    state.terminal.eventSource.close();
    state.terminal.eventSource = null;
  }
  try {
    await fetchJson(`/api/terminal/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  } catch {
    // The session may already have exited; the UI can still close cleanly.
  }
  elements.terminalStatus.textContent = "已停止";
  elements.terminalContext.textContent = "控制台已停止。";
}

async function closeTerminalPanel() {
  detachTerminalSession();
  elements.terminalOverlay.classList.add("hidden");
  elements.terminalContext.textContent = "选择课件后打开控制台。";
}

function detachTerminalSession() {
  detachTerminalEventStream();
  setTerminalInputEnabled(false);
  if (state.terminal.sessionId) {
    elements.terminalStatus.textContent = "已收起";
  }
}

function detachTerminalEventStream() {
  if (!state.terminal.eventSource) return;
  state.terminal.eventSource.close();
  state.terminal.eventSource = null;
}

function initializeTerminal() {
  if (state.terminal.xterm) return;

  const terminal = new Terminal({
    allowTransparency: false,
    cursorBlink: true,
    cursorStyle: "block",
    disableStdin: true,
    fontFamily: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    fontSize: 14,
    lineHeight: 1.28,
    macOptionIsMeta: true,
    scrollback: 6000,
    theme: {
      background: "#0d1117",
      foreground: "#dce6f5",
      cursor: "#f8fafc",
      selectionBackground: "#315efb66",
      black: "#1f2937",
      red: "#f87171",
      green: "#7dd3a8",
      yellow: "#facc15",
      blue: "#7aa2ff",
      magenta: "#c084fc",
      cyan: "#67e8f9",
      white: "#f8fafc",
      brightBlack: "#64748b",
      brightRed: "#fca5a5",
      brightGreen: "#86efac",
      brightYellow: "#fde68a",
      brightBlue: "#93c5fd",
      brightMagenta: "#d8b4fe",
      brightCyan: "#a5f3fc",
      brightWhite: "#ffffff",
    },
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(elements.terminalEmulator);
  terminal.onData((data) => {
    sendTerminalInput(data);
  });
  terminal.onResize((size) => {
    resizeTerminalSession(size);
  });

  state.terminal.xterm = terminal;
  state.terminal.fitAddon = fitAddon;
  if (typeof ResizeObserver !== "undefined") {
    state.terminal.resizeObserver = new ResizeObserver(scheduleTerminalFit);
    state.terminal.resizeObserver.observe(elements.terminalEmulator);
  }
  window.addEventListener("resize", scheduleTerminalFit);
}

function resetTerminalEmulator() {
  initializeTerminal();
  state.terminal.xterm?.reset();
  state.terminal.xterm?.clear();
}

function writeTerminalOutput(text) {
  initializeTerminal();
  state.terminal.xterm?.write(text);
}

function writeTerminalLocalLine(text) {
  initializeTerminal();
  state.terminal.xterm?.writeln(String(text || ""));
}

function setTerminalInputEnabled(enabled) {
  if (state.terminal.xterm) {
    state.terminal.xterm.options.disableStdin = !enabled;
  }
}

function scheduleTerminalFit() {
  clearTimeout(state.terminal.resizeTimer);
  state.terminal.resizeTimer = setTimeout(() => {
    fitTerminalToPanel();
  }, 60);
}

function fitTerminalToPanel() {
  initializeTerminal();
  try {
    state.terminal.fitAddon?.fit();
  } catch {
    // The element may still be hidden during overlay transitions.
  }
  const size = normalizeTerminalSize({
    cols: state.terminal.xterm?.cols || TERMINAL_FALLBACK_COLS,
    rows: state.terminal.xterm?.rows || TERMINAL_FALLBACK_ROWS,
  });
  state.terminal.lastSize = size;
  return size;
}

async function resizeTerminalSession(size) {
  const next = normalizeTerminalSize(size);
  const previous = state.terminal.lastSize;
  state.terminal.lastSize = next;
  if (!state.terminal.sessionId || (previous.cols === next.cols && previous.rows === next.rows)) return;

  try {
    await fetchJson(`/api/terminal/sessions/${encodeURIComponent(state.terminal.sessionId)}/resize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
  } catch (error) {
    elements.terminalStatus.textContent = `尺寸同步失败：${error.message}`;
  }
}

function normalizeTerminalSize(size = {}) {
  return {
    cols: clampNumber(size.cols, 1, 500, TERMINAL_FALLBACK_COLS),
    rows: clampNumber(size.rows, 1, 200, TERMINAL_FALLBACK_ROWS),
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function decodeTerminalOutput(base64) {
  const binary = atob(base64 || "");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncTerminalSession(session) {
  if (!session) return;
  if (session.id && session.id !== state.terminal.sessionId) return;
  state.terminal.pageId = session.page?.id || state.terminal.pageId;
  state.terminal.skillId = session.skill?.id || state.terminal.skillId;
  state.terminal.bootstrapPrompt = session.bootstrapPrompt || state.terminal.bootstrapPrompt;
  elements.terminalVerify.disabled = !state.terminal.sessionId || !state.terminal.bootstrapPrompt;
}

function resetTerminalBootstrap() {
  state.terminal.bootstrapPrompt = "";
  elements.terminalVerify.disabled = true;
}

function renderTerminalContextCards({ pageTitle = "当前课件", skillId = "", skillName = "", contextPath = "", status = "ready" }) {
  const statusText = status === "starting" ? "正在启动" : "手动触发";
  const contextText = contextPath ? "已挂载" : "准备中";
  const contextHint = contextPath || "等待运行环境创建上下文文件";
  return `
    <div class="terminal-context-grid">
      <div class="terminal-context-card lesson">
        <span>课件</span>
        <strong title="${escapeAttribute(pageTitle)}">${escapeHtml(pageTitle)}</strong>
        <em>当前学习上下文</em>
      </div>
      <div class="terminal-context-card skill">
        <span>能力包</span>
        <strong title="${escapeAttribute(skillName || skillId)}">${escapeHtml(skillName || skillId || "待加载")}</strong>
        <em>${escapeHtml(skillId || "等待绑定")}</em>
      </div>
      <div class="terminal-context-card context">
        <span>知识上下文</span>
        <strong title="${escapeAttribute(contextHint)}">${escapeHtml(contextText)}</strong>
        <em>运行时临时文件</em>
      </div>
      <div class="terminal-context-card mode">
        <span>模式</span>
        <strong>${escapeHtml(statusText)}</strong>
        <em>原生 TUI 直连</em>
      </div>
    </div>
  `;
}

function terminalDisplayStatus(status) {
  if (status === "running") return "就绪";
  const labels = {
    running: "运行中",
    starting: "正在启动",
    stopped: "已停止",
    exited: "已退出",
    error: "异常",
  };
  return labels[status] || status;
}

function migrationText(pack, skill) {
  return [
    `能力包：${skill.name}`,
    "",
    "OpenAI / Codex 流派：",
    `复制 ${pack.relativePath}/${skill.paths.codex} 到你的项目 .agents/skills/${skill.id}/SKILL.md`,
    "",
    "Anthropic / Claude Code 流派：",
    `复制 ${pack.relativePath}/${skill.paths.claude} 到你的项目 .claude/skills/${skill.id}/SKILL.md`,
    "",
    "Cursor 项目规则：",
    `复制 ${pack.relativePath}/${skill.paths.cursor} 到你的项目 .cursor/rules/${skill.id}.mdc`,
    "",
    "快速验证提示词：",
    skill.quickPrompt,
  ].join("\n");
}

function toggleModule(moduleId) {
  if (state.expandedModules.has(moduleId)) {
    state.expandedModules.delete(moduleId);
  } else {
    state.expandedModules.add(moduleId);
  }

  renderModules();
}

function updateActiveNav(page) {
  document.querySelectorAll(".learn-lesson-row").forEach((item) => {
    item.classList.toggle("active", item.dataset.pageId === page.id);
  });

  document.querySelectorAll(".learn-tree-node").forEach((item) => {
    item.classList.toggle("has-active", item.dataset.moduleId === page.module);
  });
}

async function loadChatHistory(pageId) {
  elements.chatLog.innerHTML = "";
  state.messages = [];

  try {
    const payload = await fetchJson(`/api/chat/history?pageId=${encodeURIComponent(pageId)}&limit=50`);
    const messages = payload.messages || [];
    if (!messages.length) {
      addMessage("assistant", `已打开《${currentPageTitle()}》。你可以直接围绕这节课继续提问。`);
      return;
    }

    for (const message of messages) {
      addMessage(message.role, message.content, message.sources || [], { html: message.answerHtml });
      appendChatHistory(message.role, message.content);
    }
  } catch (error) {
    addMessage("assistant", `聊天历史读取失败：${error.message}`);
  }
}

async function handleKnowledgeTreeAction(event) {
  const button = event.target.closest("button[data-knowledge-action]");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  try {
    if (button.dataset.knowledgeAction === "rename-page") {
      openKnowledgeEditor({ mode: "rename", type: "page", id: button.dataset.pageId });
    } else if (button.dataset.knowledgeAction === "delete-page") {
      openKnowledgeEditor({ mode: "delete", type: "page", id: button.dataset.pageId });
    } else if (button.dataset.knowledgeAction === "rename-module") {
      openKnowledgeEditor({ mode: "rename", type: "module", id: button.dataset.moduleId });
    } else if (button.dataset.knowledgeAction === "delete-module") {
      openKnowledgeEditor({ mode: "delete", type: "module", id: button.dataset.moduleId });
    } else if (button.dataset.knowledgeAction === "cancel-editor") {
      closeKnowledgeEditor();
    }
  } catch (error) {
    addMessage("assistant", `知识库更新失败：${error.message}`);
  }
}

function openKnowledgeEditor({ mode, type, id }) {
  const target = type === "module" ? findManifestModuleState(id) : findManifestPage(id);
  if (!target) return;

  state.knowledgeEditor = {
    mode,
    type,
    id,
    title: target.title,
    error: "",
  };
  renderModules();
  requestAnimationFrame(() => focusKnowledgeEditor(mode === "rename"));
}

function closeKnowledgeEditor() {
  state.knowledgeEditor = null;
  renderModules();
}

function knowledgeEditorMatches(type, id) {
  return state.knowledgeEditor?.type === type && state.knowledgeEditor?.id === id;
}

function createKnowledgeEditorPanel({ type, id, title, count }) {
  const editor = state.knowledgeEditor || {};
  const isRename = editor.mode === "rename";
  const targetName = type === "module" ? "目录" : "课件";
  const panel = document.createElement("form");
  panel.className = `knowledge-editor ${isRename ? "is-rename" : "is-delete"}`;
  panel.dataset.editorType = type;
  panel.dataset.editorId = id;
  panel.dataset.editorMode = editor.mode;
  panel.noValidate = true;

  if (isRename) {
    panel.innerHTML = `
      <div class="knowledge-editor-head">
        <strong>重命名${targetName}</strong>
        <span>只修改知识库显示名，引用跳转仍使用稳定 ID。</span>
      </div>
      <label class="knowledge-editor-field">
        <span>新的${targetName}名称</span>
        <input class="knowledge-editor-input" name="title" type="text" value="${escapeAttribute(title)}" autocomplete="off" />
      </label>
      ${editor.error ? `<div class="knowledge-editor-error">${escapeHtml(editor.error)}</div>` : ""}
      <div class="knowledge-editor-actions">
        <button type="button" class="knowledge-editor-button ghost" data-knowledge-action="cancel-editor" title="取消" aria-label="取消">${knowledgeIcon("x")}</button>
        <button type="submit" class="knowledge-editor-button primary" title="保存" aria-label="保存">${knowledgeIcon("check")}</button>
      </div>
    `;
    return panel;
  }

  const deleteHint =
    type === "module"
      ? `会隐藏该目录和其中 ${count} 个课件；历史问答仍保留在本地。`
      : "会从目录、搜索和引用跳转中隐藏；历史问答仍保留在本地。";
  panel.innerHTML = `
    <div class="knowledge-editor-head">
      <strong>删除${targetName}</strong>
      <span title="${escapeAttribute(title)}">${escapeHtml(title)}</span>
    </div>
    <p>${escapeHtml(deleteHint)}</p>
    ${editor.error ? `<div class="knowledge-editor-error">${escapeHtml(editor.error)}</div>` : ""}
    <div class="knowledge-editor-actions">
      <button type="button" class="knowledge-editor-button ghost" data-knowledge-action="cancel-editor" title="取消" aria-label="取消">${knowledgeIcon("x")}</button>
      <button type="submit" class="knowledge-editor-button danger" title="确认删除" aria-label="确认删除">${knowledgeIcon("trash")}</button>
    </div>
  `;
  return panel;
}

async function handleKnowledgeEditorSubmit(event) {
  const form = event.target.closest(".knowledge-editor");
  if (!form) return;

  event.preventDefault();
  const editor = state.knowledgeEditor;
  if (!editor || editor.type !== form.dataset.editorType || editor.id !== form.dataset.editorId) return;

  try {
    if (editor.mode === "rename") {
      const nextTitle = String(new FormData(form).get("title") || "").trim();
      await submitKnowledgeRename(editor, nextTitle);
    } else if (editor.mode === "delete") {
      await submitKnowledgeDelete(editor);
    }
  } catch (error) {
    setKnowledgeEditorError(error.message);
  }
}

function handleKnowledgeEditorKeydown(event) {
  if (!event.target.closest(".knowledge-editor")) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeKnowledgeEditor();
  }
}

async function submitKnowledgeRename(editor, nextTitle) {
  if (!nextTitle) {
    throw new Error("名称不能为空");
  }
  if (nextTitle === editor.title) {
    closeKnowledgeEditor();
    return;
  }

  if (editor.type === "page") {
    await fetchJson(`/api/knowledge/pages/${encodeURIComponent(editor.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    state.knowledgeEditor = null;
    await refreshAfterKnowledgeChange({ preferredPageId: state.currentPageId, forceLoad: state.currentPageId === editor.id });
    return;
  }

  await fetchJson(`/api/knowledge/modules/${encodeURIComponent(editor.id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: nextTitle }),
  });
  state.knowledgeEditor = null;
  await refreshAfterKnowledgeChange({ preferredPageId: state.currentPageId });
}

async function submitKnowledgeDelete(editor) {
  if (editor.type === "page") {
    await fetchJson(`/api/knowledge/pages/${encodeURIComponent(editor.id)}`, { method: "DELETE" });
    state.knowledgeEditor = null;
    await refreshAfterKnowledgeChange({ preferredPageId: state.currentPageId === editor.id ? null : state.currentPageId });
    return;
  }

  const module = findManifestModuleState(editor.id);
  const currentInModule = module?.pages.some((page) => page.id === state.currentPageId);
  await fetchJson(`/api/knowledge/modules/${encodeURIComponent(editor.id)}`, { method: "DELETE" });
  state.knowledgeEditor = null;
  await refreshAfterKnowledgeChange({ preferredPageId: currentInModule ? null : state.currentPageId });
}

function setKnowledgeEditorError(message) {
  if (!state.knowledgeEditor) return;
  state.knowledgeEditor = { ...state.knowledgeEditor, error: message };
  renderModules();
  requestAnimationFrame(() => focusKnowledgeEditor(false));
}

function focusKnowledgeEditor(selectText) {
  const input = elements.moduleList.querySelector(".knowledge-editor-input");
  if (!input) return;
  input.focus();
  if (selectText) input.select();
}

function knowledgeIcon(name) {
  const paths = {
    edit: '<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />',
    trash: '<path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" />',
    x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
    check: '<path d="m20 6-11 11-5-5" />',
  };

  return `<svg class="knowledge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || ""}</svg>`;
}

function handleKnowledgeDragStart(event) {
  if (event.target.closest(".knowledge-actions") || event.target.closest(".knowledge-editor")) {
    event.preventDefault();
    return;
  }

  const target = knowledgeDropTarget(event.target);
  if (!target) return;

  const type = target.dataset.knowledgeType;
  const id = type === "page" ? target.dataset.pageId : target.dataset.moduleId;
  if (!type || !id) return;

  state.knowledgeDrag = { type, id };
  target.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify(state.knowledgeDrag));
}

function handleKnowledgeDragOver(event) {
  const target = knowledgeDropTarget(event.target);
  if (!canDropKnowledgeTarget(target)) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearKnowledgeDragOver();
  target.classList.add("drag-over");
}

function handleKnowledgeDragLeave(event) {
  const target = knowledgeDropTarget(event.target);
  if (target && !target.contains(event.relatedTarget)) {
    target.classList.remove("drag-over");
  }
}

async function handleKnowledgeDrop(event) {
  const target = knowledgeDropTarget(event.target);
  if (!canDropKnowledgeTarget(target)) return;

  event.preventDefault();
  const drag = state.knowledgeDrag;
  clearKnowledgeDragClasses();

  try {
    if (drag.type === "module") {
      await reorderKnowledgeModules(drag.id, target.dataset.moduleId);
    } else if (drag.type === "page") {
      await reorderKnowledgePage(drag.id, target);
    }
  } catch (error) {
    addMessage("assistant", `知识库排序失败：${error.message}`);
  } finally {
    state.knowledgeDrag = null;
  }
}

function handleKnowledgeDragEnd() {
  state.knowledgeDrag = null;
  clearKnowledgeDragClasses();
}

async function reorderKnowledgeModules(sourceModuleId, targetModuleId) {
  if (!sourceModuleId || !targetModuleId || sourceModuleId === targetModuleId) return;

  const moduleIds = moveBefore(
    state.manifest.modules.map((module) => module.id),
    sourceModuleId,
    targetModuleId,
  );
  await fetchJson("/api/knowledge/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      modules: moduleIds.map((id, sortOrder) => ({ id, sortOrder })),
    }),
  });
  await refreshAfterKnowledgeChange({ preferredPageId: state.currentPageId });
}

async function reorderKnowledgePage(sourcePageId, target) {
  const targetType = target.dataset.knowledgeType;
  const targetModuleId = target.dataset.moduleId;
  const targetPageId = targetType === "page" ? target.dataset.pageId : "";
  if (!sourcePageId || !targetModuleId || sourcePageId === targetPageId) return;

  const modulePageIds = new Map(state.manifest.modules.map((module) => [module.id, module.pages.map((page) => page.id)]));
  for (const pages of modulePageIds.values()) {
    const index = pages.indexOf(sourcePageId);
    if (index >= 0) pages.splice(index, 1);
  }

  const targetPages = modulePageIds.get(targetModuleId);
  if (!targetPages) return;

  const insertIndex = targetPageId ? targetPages.indexOf(targetPageId) : targetPages.length;
  targetPages.splice(insertIndex >= 0 ? insertIndex : targetPages.length, 0, sourcePageId);

  const pages = [];
  for (const [moduleId, pageIds] of modulePageIds) {
    pageIds.forEach((id, sortOrder) => {
      pages.push({ id, moduleId, sortOrder });
    });
  }

  await fetchJson("/api/knowledge/reorder", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pages }),
  });
  await refreshAfterKnowledgeChange({ preferredPageId: state.currentPageId, forceLoad: state.currentPageId === sourcePageId });
}

async function refreshAfterKnowledgeChange({ preferredPageId = state.currentPageId, forceLoad = false } = {}) {
  await refreshWikiState();

  if (preferredPageId && findManifestPage(preferredPageId)) {
    if (forceLoad) {
      await loadPage(preferredPageId);
    } else if (state.currentPage) {
      updateActiveNav(state.currentPage);
    }
    return;
  }

  const nextPageId = firstManifestPageId();
  if (nextPageId) {
    await loadPage(nextPageId);
  } else {
    clearCurrentCourseView();
  }
}

function clearCurrentCourseView() {
  state.currentPage = null;
  state.currentPageId = null;
  state.currentModuleId = null;
  state.messages = [];
  elements.pageType.textContent = "-";
  elements.pageDifficulty.textContent = "-";
  elements.pageDuration.textContent = "-";
  elements.pageTitle.textContent = "暂无课件";
  elements.pageSummary.textContent = "导入课件后会在这里显示正文。";
  elements.pageTags.innerHTML = "";
  elements.pageContent.innerHTML = "";
  elements.chatLog.innerHTML = "";
  addMessage("assistant", "当前知识库没有可用课件。");
}

function knowledgeDropTarget(target) {
  return target?.closest?.("[data-knowledge-type]") || null;
}

function canDropKnowledgeTarget(target) {
  const drag = state.knowledgeDrag;
  if (!drag || !target) return false;

  const targetType = target.dataset.knowledgeType;
  if (drag.type === "module") {
    return targetType === "module" && target.dataset.moduleId !== drag.id;
  }

  if (drag.type === "page") {
    if (targetType === "module") return Boolean(target.dataset.moduleId);
    return targetType === "page" && target.dataset.pageId !== drag.id;
  }

  return false;
}

function clearKnowledgeDragOver() {
  document.querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over"));
}

function clearKnowledgeDragClasses() {
  clearKnowledgeDragOver();
  document.querySelectorAll(".is-dragging").forEach((item) => item.classList.remove("is-dragging"));
}

function moveBefore(items, sourceId, targetId) {
  const next = items.filter((id) => id !== sourceId);
  const targetIndex = next.indexOf(targetId);
  next.splice(targetIndex >= 0 ? targetIndex : next.length, 0, sourceId);
  return next;
}

function firstManifestPageId() {
  return state.manifest?.modules?.find((module) => module.pages.length)?.pages[0]?.id || null;
}

function findManifestModuleState(moduleId) {
  return state.manifest?.modules?.find((module) => module.id === moduleId) || null;
}

function findManifestPage(pageId) {
  for (const module of state.manifest?.modules || []) {
    const page = module.pages.find((item) => item.id === pageId);
    if (page) return { ...page, moduleId: module.id };
  }
  return null;
}

async function handleSearch() {
  const query = elements.searchInput.value.trim();
  if (!query) {
    elements.searchResults.classList.add("hidden");
    return;
  }

  const payload = await fetchJson(`/api/search?q=${encodeURIComponent(query)}`);
  elements.searchResults.classList.remove("hidden");
  elements.searchResults.innerHTML = `<h2>搜索结果：${escapeHtml(query)}</h2>`;

  if (!payload.results.length) {
    const empty = document.createElement("div");
    empty.className = "result-button";
    empty.innerHTML = "<strong>没有找到匹配内容</strong><span>换一个课程关键词试试。</span>";
    elements.searchResults.append(empty);
    return;
  }

  for (const result of payload.results) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-button";
    button.innerHTML = `<strong>${escapeHtml(result.title)}</strong><span>${escapeHtml(result.snippet)}</span>`;
    button.addEventListener("click", () => {
      elements.searchResults.classList.add("hidden");
      loadPage(result.id);
    });
    elements.searchResults.append(button);
  }
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const message = elements.chatInput.value.trim();
  await submitChatMessage(message);
}

function handleChatInputKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.isComposing || state.chatComposing) return;

  event.preventDefault();
  elements.chatForm.requestSubmit();
}

async function submitChatMessage(message) {
  const text = String(message || "").trim();
  if (!text) return;

  const contextMode = state.chatContextMode;
  const conversationHistory = buildConversationHistoryPayload();
  elements.chatInput.value = "";
  appendChatHistory("user", text);
  addMessage("user", text);
  const pendingText =
    contextMode === "current-page"
      ? `正在结合《${currentPageTitle()}》分析当前课件...`
      : `正在结合《${currentPageTitle()}》检索课程知识库...`;
  const pending = addMessage("assistant", pendingText);

  try {
    const payload = await fetchJson("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: text,
        pageId: state.currentPageId,
        moduleId: state.currentModuleId,
        contextMode,
        conversationHistory,
      }),
    });
    pending.remove();
    addMessage("assistant", payload.answer, payload.sources, { html: payload.answerHtml });
    appendChatHistory("assistant", payload.answer);
    if (payload.llmError) {
      if (shouldMarkModelError(payload.llmError)) {
        markModelError(payload.llmError);
      }
      if (contextMode !== "current-page") {
        addMessage("assistant", `${modelFallbackNotice(payload.llmError)}\n\n不过课程知识库检索已经生效，上面的回答来自当前命中的课程知识页。`);
      }
    }
  } catch (error) {
    pending.remove();
    addMessage("assistant", `请求失败：${error.message}`);
  } finally {
    state.chatContextMode = "";
  }
}

function handleChatInputChange() {
  if (!elements.chatInput.value.trim()) {
    state.chatContextMode = "";
  }
}

function shouldMarkModelError(message) {
  return !/empty answer/i.test(String(message || ""));
}

function modelFallbackNotice(message) {
  if (/empty answer/i.test(String(message || ""))) {
    return "模型这次没有返回可用内容，已使用课程知识库生成兜底回答。";
  }
  return `模型没有接通：${message}`;
}

function appendChatHistory(role, content) {
  const text = capUiText(String(content || "").replace(/\s+/g, " ").trim(), 900);
  if (!text || (role !== "user" && role !== "assistant")) return;

  state.messages.push({ role, content: text });
  if (state.messages.length > CHAT_HISTORY_LIMIT) {
    state.messages.splice(0, state.messages.length - CHAT_HISTORY_LIMIT);
  }
}

function buildConversationHistoryPayload() {
  return state.messages.slice(-CHAT_HISTORY_LIMIT).map((item) => ({
    role: item.role,
    content: item.content,
  }));
}

function handleCourseSelectionChange() {
  setTimeout(showSelectionAskForCurrentSelection, 0);
}

function showSelectionAskForCurrentSelection() {
  const selection = window.getSelection();
  const selectedText = normalizeSelectionText(selection?.toString() || "");
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed || selectedText.length < 2) {
    hideSelectionAsk();
    return;
  }

  const range = selection.getRangeAt(0);
  if (!selectionBelongsToPage(range)) {
    hideSelectionAsk();
    return;
  }

  const rect = selectionRangeRect(range);
  if (!rect) {
    hideSelectionAsk();
    return;
  }

  state.selectedCourseText = capUiText(selectedText, 800);
  positionSelectionAsk(rect);
}

function handleSelectionAskClick() {
  const selectedText = state.selectedCourseText || normalizeSelectionText(window.getSelection()?.toString() || "");
  if (!selectedText) return;

  hideSelectionAsk();
  const prompt = [
    `请结合当前课件《${currentPageTitle()}》，解释下面这段内容，并说明它在本节课里的作用：`,
    "",
    capUiText(selectedText, 800),
    "",
    "我的问题：",
  ].join("\n");
  state.chatContextMode = "current-page";
  elements.chatInput.value = prompt;
  elements.chatInput.focus();
  elements.chatInput.setSelectionRange(elements.chatInput.value.length, elements.chatInput.value.length);
}

function handleDocumentMouseDown(event) {
  if (elements.selectionAsk.contains(event.target)) return;
  if (elements.pageContent.contains(event.target)) return;
  hideSelectionAsk();
}

function hideSelectionAsk() {
  state.selectedCourseText = "";
  elements.selectionAsk.classList.add("hidden");
}

function selectionBelongsToPage(range) {
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  return Boolean(container && elements.pageContent.contains(container));
}

function selectionRangeRect(range) {
  const rect = range.getBoundingClientRect();
  if (rect.width || rect.height) return rect;
  return Array.from(range.getClientRects()).find((item) => item.width || item.height) || null;
}

function positionSelectionAsk(rect) {
  elements.selectionAsk.classList.remove("hidden");
  const buttonRect = elements.selectionAsk.getBoundingClientRect();
  const width = buttonRect.width || 64;
  const height = buttonRect.height || 34;
  const left = clamp(rect.left + rect.width / 2 - width / 2, 12, window.innerWidth - width - 12);
  const aboveTop = rect.top - height - 8;
  const top = aboveTop >= 8 ? aboveTop : rect.bottom + 8;

  elements.selectionAsk.style.left = `${Math.round(left)}px`;
  elements.selectionAsk.style.top = `${Math.round(top)}px`;
}

function normalizeSelectionText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function capUiText(value, limit) {
  const text = String(value || "").trim();
  return text.length > limit ? `${text.slice(0, limit).trim()}...` : text;
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

async function handleQuickToolClick(event) {
  const button = event.target.closest("button[data-quick-tool]");
  if (!button) return;

  const tool = button.dataset.quickTool;
  markQuickToolActive(button);

  if (tool === "ai") {
    closeQuickToolPanel();
    focusChatAssistant();
    state.chatContextMode = "";
    elements.chatInput.value = `请基于当前课件《${currentPageTitle()}》，帮我解释这节课的重点和下一步练习。`;
    elements.chatInput.select();
    return;
  }

  openQuickToolPanel(tool);
}

function openQuickToolPanel(tab) {
  state.quickToolTab = tab;
  elements.quickToolPanel.classList.remove("hidden");
  elements.quickToolDock.querySelectorAll("button[data-quick-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.quickTool === tab);
  });
  renderQuickToolPanel(tab);
}

function closeQuickToolPanel() {
  state.quickToolTab = null;
  elements.quickToolPanel.classList.add("hidden");
  elements.quickToolDock.querySelectorAll("button[data-quick-tool]").forEach((button) => {
    button.classList.remove("active");
  });
}

function renderQuickToolPanel(tab) {
  const titles = {
    materials: "参考资料",
    faq: "常见问题",
    notes: "我的笔记",
  };
  elements.quickToolTitle.textContent = titles[tab] || "课节工具";

  if (tab === "materials") {
    elements.quickToolBody.innerHTML = renderMaterialsTool();
  } else if (tab === "faq") {
    elements.quickToolBody.innerHTML = renderFaqTool();
  } else if (tab === "notes") {
    elements.quickToolBody.innerHTML = renderNotesTool();
    elements.quickToolBody.querySelector("#quick-note-input")?.focus();
  }
}

function markQuickToolActive(button) {
  elements.quickToolDock.querySelectorAll(".quick-tool-button-active").forEach((item) => {
    item.classList.remove("quick-tool-button-active");
  });
  button.classList.add("quick-tool-button-active");
  setTimeout(() => button.classList.remove("quick-tool-button-active"), 1200);
}

function focusChatAssistant() {
  elements.chatInput.focus();
  if (window.matchMedia("(max-width: 1240px)").matches) {
    document.querySelector(".chat-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function currentPageTitle() {
  return elements.pageTitle.textContent?.trim() || "当前课件";
}

function currentPage() {
  return state.currentPage || state.pages.find((page) => page.id === state.currentPageId) || {};
}

function renderMaterialsTool() {
  const page = currentPage();
  const source = page.metadata?.relativePath || page.path || page.id || "当前课件";
  const tags = (page.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
  const skills = matchingSkillPacks(page);
  const skillRows = skills.length
    ? skills
        .map((pack) => `<li><strong>${escapeHtml(pack.title)}</strong><span>${escapeHtml(pack.relativePath || "")}</span></li>`)
        .join("")
    : "<li><strong>暂无匹配能力包</strong><span>导入或配置能力包后会显示在这里</span></li>";

  return `
    <section class="tool-card">
      <span class="tool-kicker">当前课件</span>
      <strong>${escapeHtml(page.title || currentPageTitle())}</strong>
      <p>${escapeHtml(page.summary || "暂无摘要。")}</p>
      <div class="tool-tag-row">${tags || "<span>未设置标签</span>"}</div>
    </section>
    <section class="tool-card">
      <span class="tool-kicker">资料来源</span>
      <div class="tool-source-row">
        <span>类型</span>
        <strong>${escapeHtml(labelForType(page.type || "lesson"))}</strong>
      </div>
      <div class="tool-source-row">
        <span>路径</span>
        <strong title="${escapeAttribute(source)}">${escapeHtml(source)}</strong>
      </div>
      <button type="button" class="tool-inline-action" data-tool-action="copy-prompt">复制给智能体</button>
    </section>
    <section class="tool-card">
      <span class="tool-kicker">配套能力包</span>
      <ul class="tool-list">${skillRows}</ul>
    </section>
  `;
}

function renderFaqTool() {
  const title = currentPageTitle();
  const questions = [
    {
      q: "这节课应该先掌握什么？",
      a: "适合在开始学习前问，用来获得本节课的目标、前置知识和学习顺序。",
      prompt: `我正在学习《${title}》，请告诉我这节课应该先掌握什么、按什么顺序学。`,
    },
    {
      q: "学完后怎么验证自己真的会了？",
      a: "适合在学完后问，让助教生成可执行的验收任务。",
      prompt: `我已经学完《${title}》，请给我 3 个可验证的练习任务和验收标准。`,
    },
    {
      q: "实操卡住了怎么排查？",
      a: "适合遇到环境、代码、模型调用或项目集成问题时使用。",
      prompt: `我在《${title}》的实操中卡住了，请按环境、代码、模型调用、数据路径四类给我排查清单。`,
    },
    {
      q: "这节课怎么迁移到自己的项目？",
      a: "适合把课程案例转成自己的 Agent、知识库或业务项目。",
      prompt: `请基于《${title}》，告诉我如何把这节课内容迁移到自己的 Agent 或项目里。`,
    },
  ];

  return `
    <section class="tool-card">
      <span class="tool-kicker">学习问答</span>
      <strong>${escapeHtml(title)}</strong>
      <p>点击问题会发送给右侧智能学习助教，并自动携带当前课件语境。</p>
    </section>
    <div class="tool-faq-list">
      ${questions
        .map(
          (item) => `
            <button type="button" class="tool-faq-item" data-tool-question="${escapeAttribute(item.prompt)}">
              <strong>${escapeHtml(item.q)}</strong>
              <span>${escapeHtml(item.a)}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderNotesTool() {
  const saved = readCurrentNote();
  return `
    <section class="tool-card">
      <span class="tool-kicker">当前课件笔记</span>
      <strong>${escapeHtml(currentPageTitle())}</strong>
      <p>笔记会按课件独立保存到本机浏览器，切换课件后自动读取对应内容。</p>
    </section>
    <textarea id="quick-note-input" class="quick-note-input" rows="12" placeholder="记录本节课的关键结论、报错、待验证任务...">${escapeHtml(saved)}</textarea>
    <div id="quick-note-status" class="quick-note-status">${saved ? "已读取本节课笔记" : "开始输入后自动保存"}</div>
  `;
}

function handleQuickToolBodyClick(event) {
  const questionButton = event.target.closest("button[data-tool-question]");
  if (questionButton) {
    closeQuickToolPanel();
    submitChatMessage(questionButton.dataset.toolQuestion || "");
    return;
  }

  const actionButton = event.target.closest("button[data-tool-action]");
  if (actionButton?.dataset.toolAction === "copy-prompt") {
    copyCurrentPagePrompt();
  }
}

function handleQuickToolBodyInput(event) {
  if (event.target.id !== "quick-note-input") return;
  saveCurrentNote(event.target.value);
  const status = elements.quickToolBody.querySelector("#quick-note-status");
  if (status) status.textContent = "已自动保存";
}

function currentNoteKey() {
  return `fufan-course-note:${state.currentPageId || "empty"}`;
}

function readCurrentNote() {
  try {
    return localStorage.getItem(currentNoteKey()) || "";
  } catch {
    return "";
  }
}

function saveCurrentNote(value) {
  try {
    localStorage.setItem(currentNoteKey(), value);
  } catch {
    const status = elements.quickToolBody.querySelector("#quick-note-status");
    if (status) status.textContent = "保存失败：浏览器存储空间不足";
  }
}

function markModelError(message) {
  setTopModelStatus("error", message);
}

function setTopModelStatus(level, message) {
  elements.modelStatus.classList.toggle("is-ok", level === "ok");
  elements.modelStatus.classList.toggle("is-warning", level === "warning");
  elements.modelStatus.classList.toggle("is-error", level === "error");
  elements.modelStatus.innerHTML = `<span class="status-dot"></span>${escapeHtml(message)}`;
}

function promptForModelConfigIfRequired(modelPayload) {
  if (modelPayload?.settings?.configured) return;
  openModelConfig({ required: true });
}

function openModelConfig(options = {}) {
  const settings = state.modelSettings || {};
  const required = Boolean(options.required);
  state.modelConfigRequired = required;
  elements.modelConfigOverlay.classList.toggle("is-required", required);
  elements.modelConfigTitle.textContent = required ? "配置 DeepSeek API" : "模型配置";
  elements.modelConfigDescription.textContent = required
    ? "首次使用需要验证并保存你的 DeepSeek API Key，后续课程问答和智能体控制台都会读取这份配置。"
    : "保存后立即用于课程问答和新打开的智能体控制台。";
  elements.modelConfigClose.hidden = required;
  elements.configProvider.value = settings.provider || "deepseek";
  elements.configBaseUrl.value = settings.baseUrl || "https://api.deepseek.com";
  elements.configModel.value = settings.model || "deepseek-v4-flash";
  elements.configApiKey.value = "";
  elements.configApiKey.required = required && !settings.configured;
  elements.configApiKey.placeholder = required ? "请输入你的 DeepSeek API Key" : "留空则保留当前密钥";
  elements.configSave.textContent = required ? "验证并保存" : "保存配置";
  elements.modelConfigOverlay.classList.remove("hidden");
  renderConfigStatus({
    llm: { ok: Boolean(settings.configured), message: settings.configured ? `已保存密钥：${settings.apiKeyMasked}` : "尚未保存模型密钥" },
    terminal: { ok: true, message: "等待测试智能体控制台运行环境" },
  });
  elements.configApiKey.focus();
}

function closeModelConfig() {
  if (state.modelConfigRequired && !state.modelSettings?.configured) {
    renderConfigStatus({ llm: { ok: false, message: "请先验证并保存 DeepSeek API Key。" } });
    elements.configApiKey.focus();
    return;
  }
  state.modelConfigRequired = false;
  elements.modelConfigOverlay.classList.remove("is-required");
  elements.modelConfigClose.hidden = false;
  elements.configApiKey.required = false;
  elements.configSave.textContent = "保存配置";
  elements.modelConfigOverlay.classList.add("hidden");
}

async function handleModelConfigSave(event) {
  event.preventDefault();
  if (state.modelConfigRequired) {
    await verifyAndSaveRequiredModelConfig();
    return;
  }

  setConfigBusy(true, "正在保存配置...");
  try {
    const payload = await fetchJson("/api/settings/model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(readModelConfigForm()),
    });
    state.modelSettings = payload.settings;
    elements.configApiKey.value = "";
    renderTopModelStatus(payload);
    renderConfigStatus({
      llm: {
        ok: payload.llm.configured,
        message: payload.llm.configured ? `已保存：${payload.settings.apiKeyMasked}` : "已保存基础配置，尚未保存密钥",
      },
      terminal: {
        ok: payload.terminal.available && payload.terminal.configured,
        message: payload.terminal.available
          ? payload.terminal.configured
            ? "智能体控制台可读取当前模型配置"
            : "智能体控制台可用，但尚未配置模型密钥"
          : "未找到智能体运行环境",
      },
    });
    addMessage("assistant", "模型配置已保存。后续课程问答和新打开的智能体控制台都会使用这份配置。");
  } catch (error) {
    renderConfigStatus({ llm: { ok: false, message: `保存失败：${error.message}` } });
  } finally {
    setConfigBusy(false);
    await refreshRuntimeStatus();
  }
}

async function verifyAndSaveRequiredModelConfig() {
  const form = readModelConfigForm();
  if (!form.apiKey) {
    renderConfigStatus({ llm: { ok: false, message: "请输入 DeepSeek API Key 后再验证。" } });
    elements.configApiKey.focus();
    return;
  }

  setConfigBusy(true, "正在验证并保存模型配置...");
  try {
    const payload = await fetchJson("/api/settings/model/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, saveOnSuccess: true }),
    });
    renderConfigStatus(payload);
    if (!payload.llm?.ok) {
      setTopModelStatus("error", payload.llm?.message || "模型连接失败");
      return;
    }

    state.modelSettings = payload.settings;
    elements.configApiKey.value = "";
    renderTopModelStatus(payload);
    state.modelConfigRequired = false;
    closeModelConfig();
    addMessage("assistant", "DeepSeek API 已验证并保存。现在可以继续使用课程问答和赋范智能体控制台。");
  } catch (error) {
    setTopModelStatus("error", `模型测试失败：${error.message}`);
    renderConfigStatus({ llm: { ok: false, message: `验证失败：${error.message}` } });
  } finally {
    setConfigBusy(false);
    await refreshRuntimeStatus();
  }
}

async function handleModelConfigTest() {
  setConfigBusy(true, "正在测试模型连接...");
  try {
    const payload = await fetchJson("/api/settings/model/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(readModelConfigForm()),
    });
    renderConfigStatus(payload);
    if (payload.llm?.ok) {
      setTopModelStatus("ok", `模型连接正常 · ${payload.llm.model || elements.configModel.value.trim()}`);
    } else {
      setTopModelStatus("error", payload.llm?.message || "模型连接失败");
    }
  } catch (error) {
    setTopModelStatus("error", `模型测试失败：${error.message}`);
    renderConfigStatus({ llm: { ok: false, message: `测试失败：${error.message}` } });
  } finally {
    setConfigBusy(false);
  }
}

function readModelConfigForm() {
  return {
    provider: elements.configProvider.value.trim(),
    baseUrl: elements.configBaseUrl.value.trim(),
    model: elements.configModel.value.trim(),
    apiKey: elements.configApiKey.value.trim(),
  };
}

function renderConfigStatus(payload = {}) {
  const llm = payload.llm || {};
  const terminal = payload.terminal || {};
  elements.configStatus.innerHTML = [
    renderServiceCard({
      title: "课程问答服务",
      ok: Boolean(llm.ok ?? llm.configured),
      message: llm.message || (llm.configured ? "已配置模型密钥" : "等待测试连接"),
      meta: llm.latencyMs ? `耗时 ${llm.latencyMs} 毫秒` : llm.model || "",
    }),
    renderServiceCard({
      title: "智能体控制台服务",
      ok: Boolean(terminal.ok ?? (terminal.available && terminal.configured)),
      message: terminal.message || terminalStatusMessage(terminal),
      meta: terminal.model || "",
    }),
  ].join("");
}

function renderServiceCard({ title, ok, message, meta }) {
  return `
    <div class="config-status-card ${ok ? "ok" : "bad"}">
      <span>${escapeHtml(title)}</span>
      <strong>${ok ? "正常" : "待处理"}</strong>
      <p>${escapeHtml(message || "")}</p>
      ${meta ? `<em>${escapeHtml(meta)}</em>` : ""}
    </div>
  `;
}

function terminalStatusMessage(terminal = {}) {
  if (!terminal.available) return "未找到智能体运行环境";
  if (!terminal.configured) return "运行环境可用，尚未配置模型密钥";
  return "运行环境可用，并可读取当前模型配置";
}

function setConfigBusy(busy, message = "") {
  elements.configTest.disabled = busy;
  elements.configSave.disabled = busy;
  if (message) {
    elements.configStatus.innerHTML = renderServiceCard({ title: "配置状态", ok: true, message });
  }
}

async function handleScanCourse() {
  const rootPath = elements.importRoot.value.trim();
  if (!rootPath) return;

  elements.scanCourse.disabled = true;
  elements.importSummary.textContent = "正在扫描课件目录...";
  elements.importTree.innerHTML = "";

  try {
    const payload = await fetchJson("/api/import/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rootPath }),
    });
    state.lastScan = payload;
    elements.importSummary.innerHTML = renderImportSummary(payload.summary);
    elements.importTree.innerHTML = renderImportTree(payload.tree);
  } catch (error) {
    elements.importSummary.textContent = `扫描失败：${error.message}`;
  } finally {
    elements.scanCourse.disabled = false;
  }
}

async function handlePickFolder() {
  showImportPanel();
  elements.importToggle.disabled = true;
  elements.pickFolder.disabled = true;
  elements.scanCourse.disabled = true;
  elements.importSummary.textContent = "正在打开系统文件夹选择器...";
  elements.importTree.innerHTML = "";

  try {
    const payload = await fetchJson("/api/import/pick-folder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    elements.importRoot.value = payload.rootPath;
    state.lastScan = payload;
    elements.importSummary.innerHTML = renderImportSummary(payload.summary);
    elements.importTree.innerHTML = renderImportTree(payload.tree);
  } catch (error) {
    elements.importSummary.textContent = error.message;
  } finally {
    elements.importToggle.disabled = false;
    elements.pickFolder.disabled = false;
    elements.scanCourse.disabled = false;
  }
}

function showImportPanel() {
  elements.importPanel.classList.remove("hidden");
  elements.importToggle.setAttribute("aria-expanded", "true");
  elements.importToggle.textContent = "收起导入";
}

function hideImportPanel() {
  elements.importPanel.classList.add("hidden");
  elements.importToggle.setAttribute("aria-expanded", "false");
  elements.importToggle.textContent = "导入课件";
}

function toggleImportPanel() {
  if (elements.importPanel.classList.contains("hidden")) {
    showImportPanel();
  } else {
    hideImportPanel();
  }
}

async function handleImportCourse() {
  const rootPath = elements.importRoot.value.trim();
  if (!rootPath) return;

  elements.runImport.disabled = true;
  elements.importSummary.textContent = "正在导入并生成课程知识页...";

  try {
    const payload = await fetchJson("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rootPath, limit: 1000 }),
    });
    state.manifest = payload.manifest;
    elements.importSummary.innerHTML = [
      `<strong>导入完成</strong>`,
      `<span>本次导入 ${payload.stats.imported} 个，跳过未变化 ${payload.stats.skippedUnchanged} 个，失败 ${payload.stats.failed} 个。</span>`,
      `<span>当前知识库共 ${payload.wikiPages} 页。</span>`,
    ].join("");
    await refreshWikiState();
    await refreshRuntimeStatus();
  } catch (error) {
    elements.importSummary.textContent = `导入失败：${error.message}`;
  } finally {
    elements.runImport.disabled = false;
  }
}

function addMessage(role, text, sources = [], options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const body = document.createElement("div");
  if (role === "assistant" && options.html) {
    body.className = "message-markdown";
    body.innerHTML = options.html;
  } else {
    body.className = "message-text";
    body.textContent = text;
  }
  wrapper.append(body);

  if (sources.length) {
    const list = document.createElement("div");
    list.className = "source-list";
    for (const source of sources.slice(0, 4)) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `引用：${source.title}`;
      button.addEventListener("click", () => loadPage(source.id));
      list.append(button);
    }
    wrapper.append(list);
  }

  elements.chatLog.append(wrapper);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
  return wrapper;
}

function renderImportSummary(summary) {
  const extensions = Object.entries(summary.byExtension || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([extension, count]) => `${escapeHtml(extension)} ${count}`)
    .join(" · ");

  return [
    `<strong>${summary.totalFiles} 个文件</strong>`,
    `<span>可索引 ${summary.indexableFiles} 个，资料资产 ${summary.assetFiles} 个，暂不处理 ${summary.ignoredFiles} 个。</span>`,
    `<span>${extensions}</span>`,
  ].join("");
}

function renderImportTree(root) {
  const budget = { count: 0, max: 360 };
  return renderTreeNode(root, budget, true);
}

function renderTreeNode(node, budget, root = false) {
  if (budget.count >= budget.max) return "";
  budget.count += 1;

  if (node.type === "file") {
    const importable = node.importable ? "可索引" : node.kind === "asset" ? "资料" : "跳过";
    return `<div class="import-file ${node.importable ? "indexable" : ""}">
      <span>${escapeHtml(node.name)}</span>
      <em>${escapeHtml(importable)} · ${escapeHtml(node.status)}</em>
    </div>`;
  }

  const children = (node.children || []).map((child) => renderTreeNode(child, budget)).filter(Boolean).join("");
  const open = root ? " open" : "";
  return `<details${open}>
    <summary>${escapeHtml(node.name || "课件目录")} <span>${node.counts?.indexable || 0}/${node.counts?.total || 0}</span></summary>
    ${children || '<div class="import-file"><span>暂无可展示文件</span></div>'}
  </details>`;
}

async function copyCurrentPagePrompt() {
  if (!state.currentPageId) return;

  const payload = await fetchJson(`/api/pages/${encodeURIComponent(state.currentPageId)}`);
  const page = payload.page;
  const prompt = [
    `请你学习这门课程知识页：《${page.title}》。`,
    "",
    "你需要完成：",
    "1. 用 5 条以内要点复述这页讲了什么。",
    "2. 提取可执行任务清单。",
    "3. 说明这页和当前项目开发有什么关系。",
    "4. 如果要继续实现，请先给出测试或验收标准。",
    "",
    "知识页正文：",
    page.body,
  ].join("\n");

  try {
    await writeClipboardWithTimeout(prompt, 350);
    elements.copyAgentPrompt.textContent = "已复制";
    setTimeout(() => {
      elements.copyAgentPrompt.textContent = "复制给智能体";
    }, 1300);
  } catch {
    elements.chatInput.value = prompt;
    elements.chatInput.focus();
  }
}

function writeClipboardWithTimeout(text, timeoutMs) {
  if (!navigator.clipboard?.writeText) {
    return Promise.reject(new Error("Clipboard API unavailable"));
  }

  return Promise.race([
    navigator.clipboard.writeText(text),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Clipboard write timed out")), timeoutMs);
    }),
  ]);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message || `HTTP ${response.status}`);
    error.code = payload.error?.code || "";
    error.status = response.status;
    throw error;
  }
  return payload;
}

function labelForType(type) {
  const labels = {
    lesson: "课程",
    project: "项目",
    concept: "概念",
    tool: "工具",
    faq: "问答",
    imported: "导入课件",
  };
  return labels[type] || type;
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
