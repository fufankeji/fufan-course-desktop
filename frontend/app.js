import { terminalInputChunks, terminalSubmitDelayMs } from "./terminal-input.js";
import { createTerminalScreen } from "./terminal-screen.js";
import { cleanTerminalTranscript, terminalTurnCompleted } from "./terminal-transcript.js";

const TERMINAL_COLS = 96;
const TERMINAL_ROWS = 32;

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
  quickToolTab: null,
  terminal: {
    sessionId: null,
    eventSource: null,
    packId: null,
    pageId: null,
    skillId: null,
    bootstrapPrompt: "",
    activeAssistant: null,
    turnActive: false,
    lastSubmitted: "",
    screen: null,
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
  readerContext: document.querySelector("#reader-context"),
  copyAgentPrompt: document.querySelector("#copy-agent-prompt"),
  searchInput: document.querySelector("#global-search"),
  searchClear: document.querySelector("#search-clear"),
  searchResults: document.querySelector("#search-results"),
  modelStatus: document.querySelector("#model-status"),
  modelConfigOpen: document.querySelector("#model-config-open"),
  modelConfigOverlay: document.querySelector("#model-config-overlay"),
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
  terminalFeed: document.querySelector("#terminal-feed"),
  terminalOutput: document.querySelector("#terminal-output"),
  terminalContext: document.querySelector("#terminal-context"),
  terminalForm: document.querySelector("#terminal-form"),
  terminalInput: document.querySelector("#terminal-input"),
  terminalVerify: document.querySelector("#terminal-verify"),
  terminalSend: document.querySelector("#terminal-send"),
  terminalStop: document.querySelector("#terminal-stop"),
  terminalClose: document.querySelector("#terminal-close"),
};

await boot();

async function boot() {
  await Promise.all([refreshWikiState(), refreshRuntimeStatus(), refreshSkillPacks()]);
  wireEvents();

  const firstPageId = state.manifest.modules[0]?.pages[0]?.id;
  if (firstPageId) {
    await loadPage(firstPageId);
  }

  addMessage("assistant", "课程知识库已加载。你可以搜索课程页，也可以直接问：我想做企业级检索增强项目，应该先学什么？");
}

function wireEvents() {
  elements.searchInput.addEventListener("input", debounce(handleSearch, 180));
  elements.searchClear.addEventListener("click", () => {
    elements.searchInput.value = "";
    elements.searchResults.classList.add("hidden");
  });
  elements.chatExample.addEventListener("click", () => {
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
  elements.terminalForm.addEventListener("submit", handleTerminalSubmit);
  elements.terminalVerify.addEventListener("click", handleTerminalVerify);
  elements.terminalStop.addEventListener("click", stopTerminalSession);
  elements.terminalClose.addEventListener("click", closeTerminalPanel);
  elements.terminalInput.addEventListener("keydown", handleTerminalKeydown);
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
  renderTopModelStatus(modelPayload);

  if (importStatus.importedSources) {
    elements.importSummary.textContent = `已导入 ${importStatus.importedSources} 个来源，生成 ${importStatus.importedPages} 个知识页。`;
  }
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

    row.append(toggle, title);
    wrapper.append(row);

    const children = document.createElement("div");
    children.className = "learn-tree-children";

    for (const page of module.pages) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `learn-tree-row learn-lesson-row learn-lesson ${page.id === state.currentPageId ? "active" : ""}`;
      button.dataset.pageId = page.id;
      button.innerHTML = `
        <span class="learn-tree-toggle-spacer" aria-hidden="true"></span>
        <span class="learn-tree-link"><span>${escapeHtml(page.title)}</span></span>
      `;
      button.addEventListener("click", () => loadPage(page.id));
      children.append(button);
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

  if (!state.expandedModules.has(page.module)) {
    state.expandedModules.add(page.module);
    renderModules();
  }

  updateActiveNav(page);
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
  if (state.terminal.sessionId) {
    await stopTerminalSession();
  }

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
  resetTerminalFeed();
  state.terminal.screen = createTerminalScreen({ cols: TERMINAL_COLS, rows: TERMINAL_ROWS });
  renderTerminalScreen();
  elements.terminalInput.value = "";
  elements.terminalInput.disabled = true;
  elements.terminalSend.disabled = true;
  elements.terminalVerify.disabled = true;
  addTerminalMessage("system", `正在为《${pageTitle}》启动赋范智能体。`);
  appendTerminalLine(`正在为《${pageTitle}》启动独立智能体会话...`);

  try {
    const payload = await fetchJson("/api/terminal/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packId, skillId, pageId, cols: TERMINAL_COLS, rows: TERMINAL_ROWS }),
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
    elements.terminalInput.disabled = false;
    elements.terminalSend.disabled = false;
    elements.terminalVerify.disabled = !state.terminal.bootstrapPrompt;
    elements.terminalContext.innerHTML = renderTerminalContextCards({
      pageTitle: payload.session.page?.title || pageTitle,
      skillId: payload.session.skill?.id || skillId,
      skillName: payload.session.skill?.name,
      contextPath: payload.session.relativeContextFile,
      status: "ready",
    });
    addTerminalMessage(
      "system",
      [
        payload.session.page?.title ? `课件已绑定：${payload.session.page.title}` : "课件已绑定。",
        payload.session.skill?.id ? `能力包已加载：${payload.session.skill.id}` : "能力包已加载。",
        "现在可以直接提问；需要看标准效果时，点击“运行验证”。",
      ].join("\n"),
    );
    connectTerminalEvents(payload.session.id);
    elements.terminalInput.focus();
  } catch (error) {
    elements.terminalStatus.textContent = "异常";
    elements.terminalContext.textContent = "控制台启动失败。";
    addTerminalMessage("assistant", `启动失败：${error.message}`);
    appendTerminalLine(`启动失败：${error.message}`);
  }
}

function connectTerminalEvents(sessionId) {
  if (state.terminal.eventSource) {
    state.terminal.eventSource.close();
  }

  const source = new EventSource(`/api/terminal/sessions/${encodeURIComponent(sessionId)}/events`);
  state.terminal.eventSource = source;
  source.addEventListener("terminal", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "hello") {
      syncTerminalSession(payload.session);
    } else if (payload.type === "output") {
      appendTerminalText(decodeTerminalOutput(payload.data));
    } else if (payload.type === "status") {
      elements.terminalStatus.textContent = terminalDisplayStatus(payload.status);
      syncTerminalSession(payload.session);
    } else if (payload.type === "exit") {
      elements.terminalStatus.textContent = `已退出 ${payload.code ?? ""}`.trim();
      appendTerminalLine(`进程已退出${payload.signal ? `：${payload.signal}` : ""}`);
      elements.terminalInput.disabled = true;
      elements.terminalSend.disabled = true;
      elements.terminalVerify.disabled = true;
      source.close();
    } else if (payload.type === "error") {
      elements.terminalStatus.textContent = "异常";
      appendTerminalLine(payload.message || "终端进程异常。");
    }
  });
  source.onerror = () => {
    elements.terminalStatus.textContent = "连接断开";
  };
}

async function handleTerminalSubmit(event) {
  event.preventDefault();
  const value = elements.terminalInput.value.trim();
  if (!state.terminal.sessionId) return;
  if (!value) return;

  elements.terminalInput.value = "";
  beginTerminalTurn(value, value);
  await submitTerminalText(value);
}

async function handleTerminalVerify() {
  if (!state.terminal.sessionId || !state.terminal.bootstrapPrompt) return;
  beginTerminalTurn("运行当前课件能力验证", state.terminal.bootstrapPrompt);
  await submitTerminalText(state.terminal.bootstrapPrompt);
}

async function submitTerminalText(value) {
  if (!state.terminal.sessionId) return;
  const chunks = terminalInputChunks(value);
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) await sleep(terminalSubmitDelayMs(value));
    await sendTerminalInput(chunk);
  }
}

function handleTerminalKeydown(event) {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    elements.terminalForm.requestSubmit();
    return;
  }

  if (event.key === "c" && event.ctrlKey && !elements.terminalInput.value) {
    event.preventDefault();
    sendTerminalInput("\x03");
  }
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
    appendTerminalLine(`发送失败：${error.message}`);
  }
}

async function stopTerminalSession() {
  if (!state.terminal.sessionId) return;
  const sessionId = state.terminal.sessionId;
  state.terminal.sessionId = null;
  state.terminal.packId = null;
  state.terminal.pageId = null;
  state.terminal.skillId = null;
  state.terminal.activeAssistant = null;
  state.terminal.turnActive = false;
  state.terminal.lastSubmitted = "";
  resetTerminalBootstrap();
  elements.terminalInput.disabled = true;
  elements.terminalSend.disabled = true;
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
  await stopTerminalSession();
  elements.terminalOverlay.classList.add("hidden");
  elements.terminalContext.textContent = "选择课件后打开控制台。";
  resetTerminalFeed();
}

function appendTerminalLine(text) {
  appendTerminalText(`${text}\n`);
}

function appendTerminalText(text) {
  if (!state.terminal.screen) {
    state.terminal.screen = createTerminalScreen({ cols: TERMINAL_COLS, rows: TERMINAL_ROWS });
  }
  state.terminal.screen.write(text);
  renderTerminalScreen();
  syncTerminalFeedFromScreen();
}

function renderTerminalScreen() {
  elements.terminalOutput.textContent = state.terminal.screen ? state.terminal.screen.toString() : "";
  elements.terminalOutput.scrollTop = elements.terminalOutput.scrollHeight;
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
        <em>点击验证才发送任务</em>
      </div>
    </div>
  `;
}

function resetTerminalFeed() {
  elements.terminalFeed.innerHTML = "";
  state.terminal.activeAssistant = null;
  state.terminal.turnActive = false;
  state.terminal.lastSubmitted = "";
}

function beginTerminalTurn(label, submitted) {
  state.terminal.turnActive = true;
  state.terminal.lastSubmitted = submitted;
  addTerminalMessage("user", label);
  state.terminal.activeAssistant = addTerminalMessage("assistant", "赋范智能体正在处理...");
  setTerminalBusy(true);
}

function syncTerminalFeedFromScreen() {
  if (!state.terminal.turnActive || !state.terminal.activeAssistant || !state.terminal.screen) return;
  const screenText = state.terminal.screen.toString();
  if (!terminalTurnCompleted(screenText)) return;

  const transcript = cleanTerminalTranscript(screenText, { submitted: state.terminal.lastSubmitted });
  updateTerminalMessage(
    state.terminal.activeAssistant,
    transcript || "执行完成。当前运行日志没有返回可提取的文本，可展开“原始运行日志”查看。",
  );
  state.terminal.activeAssistant = null;
  state.terminal.turnActive = false;
  state.terminal.lastSubmitted = "";
  setTerminalBusy(false);
}

function addTerminalMessage(role, text) {
  const message = document.createElement("div");
  message.className = `terminal-message ${role}`;
  const label = document.createElement("span");
  label.className = "terminal-message-role";
  label.textContent = role === "user" ? "你" : "赋范智能体";
  const body = document.createElement("p");
  body.textContent = text;
  message.append(label, body);
  elements.terminalFeed.append(message);
  elements.terminalFeed.scrollTop = elements.terminalFeed.scrollHeight;
  return message;
}

function updateTerminalMessage(message, text) {
  const body = message.querySelector("p");
  if (body) body.textContent = text;
  elements.terminalFeed.scrollTop = elements.terminalFeed.scrollHeight;
}

function setTerminalBusy(busy) {
  elements.terminalInput.disabled = busy || !state.terminal.sessionId;
  elements.terminalSend.disabled = busy || !state.terminal.sessionId;
  elements.terminalVerify.disabled = busy || !state.terminal.sessionId || !state.terminal.bootstrapPrompt;
  elements.terminalStatus.textContent = busy ? "运行中" : state.terminal.sessionId ? "就绪" : elements.terminalStatus.textContent;
}

function terminalDisplayStatus(status) {
  if (status === "running" && !state.terminal.turnActive) return "就绪";
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

async function submitChatMessage(message) {
  const text = String(message || "").trim();
  if (!text) return;

  elements.chatInput.value = "";
  addMessage("user", text);
  const pending = addMessage("assistant", "正在检索课程知识库...");

  try {
    const payload = await fetchJson("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    pending.remove();
    addMessage("assistant", payload.answer, payload.sources);
    if (payload.llmError) {
      markModelError(payload.llmError);
      addMessage("assistant", `模型没有接通：${payload.llmError}\n\n不过课程知识库检索已经生效，上面的回答来自当前命中的课程知识页。`);
    }
  } catch (error) {
    pending.remove();
    addMessage("assistant", `请求失败：${error.message}`);
  }
}

async function handleQuickToolClick(event) {
  const button = event.target.closest("button[data-quick-tool]");
  if (!button) return;

  const tool = button.dataset.quickTool;
  markQuickToolActive(button);

  if (tool === "ai") {
    closeQuickToolPanel();
    focusChatAssistant();
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

function openModelConfig() {
  const settings = state.modelSettings || {};
  elements.configProvider.value = settings.provider || "deepseek";
  elements.configBaseUrl.value = settings.baseUrl || "https://api.deepseek.com";
  elements.configModel.value = settings.model || "deepseek-v4-flash";
  elements.configApiKey.value = "";
  elements.modelConfigOverlay.classList.remove("hidden");
  renderConfigStatus({
    llm: { ok: Boolean(settings.configured), message: settings.configured ? `已保存密钥：${settings.apiKeyMasked}` : "尚未保存模型密钥" },
    terminal: { ok: true, message: "等待测试智能体控制台运行环境" },
  });
  elements.configApiKey.focus();
}

function closeModelConfig() {
  elements.modelConfigOverlay.classList.add("hidden");
}

async function handleModelConfigSave(event) {
  event.preventDefault();
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

function addMessage(role, text, sources = []) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  wrapper.append(paragraph);

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
    throw new Error(payload.error?.message || `HTTP ${response.status}`);
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
