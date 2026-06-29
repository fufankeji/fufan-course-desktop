import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDot,
  CirclePlus,
  Database,
  FileText,
  Folder,
  GitBranch,
  KeyRound,
  LoaderCircle,
  MessageSquare,
  Moon,
  PlugZap,
  RefreshCw,
  Send,
  Server,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Terminal,
  TestTube2
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyProvider,
  createThread,
  interruptTurn,
  listProviders,
  listThreads,
  runtimeInfo,
  startTurn,
  teachingEvents,
  teachingEventsUrl,
  testProvider,
  threadEventsUrl,
  workspaceFileContent,
  workspaceFiles,
  workspaceStatus
} from './api';
import type {
  ProviderCatalogEntry,
  ProvidersResponse,
  RuntimeConnection,
  RuntimeInfo,
  RuntimeThreadEvent,
  TeachingEvent,
  ThreadRecord,
  ThreadSummary,
  WorkspaceFileContent,
  WorkspaceFileEntry,
  WorkspaceFilesResponse,
  WorkspaceStatus
} from './types';

const STORED_RUNTIME_URL = 'fufan.runtimeUrl';
const STORED_THEME = 'fufan.theme';

type ConnectionStatus = 'idle' | 'connected' | 'error';

type ProviderForm = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  persist: boolean;
};

type LogLine = {
  id: string;
  kind: 'info' | 'error' | 'success';
  text: string;
};

type RuntimeOutputItem = {
  id: string;
  seq: number;
  event: string;
  tone: 'assistant' | 'user' | 'tool' | 'status' | 'error' | 'safety';
  title: string;
  text: string;
  meta?: string;
};

function storedRuntimeUrl() {
  return localStorage.getItem(STORED_RUNTIME_URL) ?? 'http://127.0.0.1:7878';
}

function storedTheme() {
  return (localStorage.getItem(STORED_THEME) as 'light' | 'dark' | null) ?? 'light';
}

function formatBytes(size?: number) {
  if (size === undefined) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function eventTone(severity: string) {
  if (severity === 'error') return 'danger';
  if (severity === 'warning') return 'warning';
  if (severity === 'debug') return 'muted';
  return 'info';
}

function teachingCategoryMeta(event: TeachingEvent) {
  const category = event.category.toLowerCase();
  const type = event.type.toLowerCase();
  const summary = event.summary.toLowerCase();
  if (summary.includes('user_message')) {
    return { label: '用户输入', className: 'user-input', Icon: MessageSquare };
  }
  if (summary.includes('agent_message')) {
    return { label: '助手回复', className: 'assistant-output', Icon: Bot };
  }
  if (category.includes('skill') || type.includes('skill')) {
    return { label: 'Skill 加载', className: 'skills', Icon: Sparkles };
  }
  if (category.includes('shell') || type.includes('shell')) {
    return { label: '终端命令', className: 'shell', Icon: Terminal };
  }
  if (category.includes('file') || type.includes('file')) {
    return { label: '文件变化', className: 'files', Icon: FileText };
  }
  if (category.includes('tool') || type.includes('tool')) {
    return { label: '工具调用', className: 'tools', Icon: Bot };
  }
  if (category.includes('safety') || type.includes('safety')) {
    return { label: '安全边界', className: 'safety', Icon: Shield };
  }
  return { label: '上下文', className: 'context', Icon: MessageSquare };
}

function teachingReadableSummary(event: TeachingEvent) {
  const type = event.type.toLowerCase();
  const summary = event.summary.trim();
  if (type.includes('session-started')) return '建立会话上下文';
  if (type.includes('context-updated') && summary.toLowerCase().includes('started model turn')) return '模型开始理解本轮任务';
  if (type.includes('context-updated') && summary.toLowerCase().includes('completed model turn')) return '本轮模型调用结束';
  if (type.includes('tool-started') && summary.toLowerCase().includes('user_message')) return '收到用户输入';
  if (type.includes('tool-started') && summary.toLowerCase().includes('agent_message')) return '开始生成助手回复';
  if (type.includes('tool-finished') && summary) return summary;
  if (type.includes('safety') || event.category.toLowerCase().includes('safety')) return summary || '安全策略介入';
  return summary || event.type;
}

function teachingReadableDetail(event: TeachingEvent) {
  const actor = event.actor === 'agent' ? 'Agent' : event.actor === 'system' ? '系统' : '用户';
  const visibility = event.visibility === 'teacher' ? '教师可见' : '课堂可见';
  return `${actor} · ${visibility}`;
}

function statusText(status: ConnectionStatus) {
  if (status === 'connected') return 'connected';
  if (status === 'error') return 'offline';
  return 'idle';
}

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function compactJson(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function outputTone(event: RuntimeThreadEvent): RuntimeOutputItem['tone'] {
  if (event.event === 'item.failed' || event.event === 'sandbox.denied') return 'error';
  if (event.event.startsWith('approval.')) return 'safety';
  if (event.event.startsWith('turn.') || event.event === 'thread.started') return 'status';
  const item = nestedRecord(event.payload.item);
  const tool = nestedRecord(event.payload.tool);
  const kind = String(event.payload.kind ?? item?.kind ?? tool?.name ?? '');
  if (kind === 'user_message') return 'user';
  if (kind === 'agent_message') return 'assistant';
  if (kind.includes('tool') || event.event.startsWith('item.')) return 'tool';
  return 'status';
}

function runtimeEventTitle(event: RuntimeThreadEvent) {
  const item = nestedRecord(event.payload.item);
  const tool = nestedRecord(event.payload.tool);
  const turn = nestedRecord(event.payload.turn);
  const toolName = String(tool?.name ?? item?.name ?? item?.kind ?? 'tool');
  if (event.event === 'item.delta' && event.payload.kind === 'agent_message') return '助手';
  if (event.event === 'item.completed' && item?.kind === 'user_message') return '你';
  if (event.event === 'item.completed' && item?.kind === 'agent_message') return '助手';
  if (event.event === 'item.started') return `启动 ${toolName}`;
  if (event.event === 'item.completed') return String(item?.summary ?? `Completed ${toolName}`);
  if (event.event === 'item.failed') return String(item?.summary ?? `Failed ${toolName}`);
  if (event.event === 'thread.started') return '会话已准备';
  if (event.event === 'turn.started') return String(turn?.input_summary ?? 'Turn started');
  if (event.event === 'turn.lifecycle') return String(turn?.status ?? item?.summary ?? '运行状态');
  if (event.event === 'turn.completed') return String(turn?.status === 'completed' ? '已完成' : turn?.status ?? '已结束');
  if (event.event === 'approval.required') return '需要审批';
  if (event.event === 'approval.decided') return '审批已处理';
  if (event.event === 'sandbox.denied') return '沙箱已拦截';
  return event.event;
}

function runtimeEventText(event: RuntimeThreadEvent) {
  if (event.event === 'item.delta') {
    return payloadString(event.payload, 'delta');
  }
  if (event.event === 'thread.started') {
    return '';
  }
  if (event.event === 'approval.required') {
    const toolName = payloadString(event.payload, 'tool_name');
    const reason = payloadString(event.payload, 'description');
    return [`需要在运行该 Runtime 的终端中处理审批。`, toolName && `工具：${toolName}`, reason].filter(Boolean).join('\n');
  }
  if (event.event === 'approval.timeout') {
    return '审批已超时，请回到终端确认当前 turn 状态。';
  }
  if (event.event === 'approval.decided') {
    return payloadString(event.payload, 'decision') || '审批已处理。';
  }
  if (event.event.startsWith('turn.')) {
    const turn = nestedRecord(event.payload.turn);
    const error = nestedRecord(turn?.error);
    return String(error?.message ?? turn?.error ?? '');
  }
  const item = nestedRecord(event.payload.item);
  const tool = nestedRecord(event.payload.tool);
  return (
    String(item?.detail ?? item?.summary ?? '') ||
    compactJson(tool?.input) ||
    payloadString(event.payload, 'message') ||
    compactJson(event.payload)
  );
}

function mergeRuntimeOutput(current: RuntimeOutputItem[], event: RuntimeThreadEvent): RuntimeOutputItem[] {
  if (event.event === 'thread.started' || event.event === 'turn.lifecycle') {
    return current;
  }
  if (event.event === 'turn.started') {
    return current;
  }

  const item = nestedRecord(event.payload.item);
  const tool = nestedRecord(event.payload.tool);
  const id = event.item_id ?? String(item?.id ?? tool?.id ?? `${event.turn_id ?? event.thread_id}-${event.event}-${event.seq}`);
  const meta = event.turn_id ? `Turn ${event.turn_id}` : undefined;

  if (event.event === 'item.delta' && event.payload.kind === 'agent_message') {
    const text = runtimeEventText(event);
    const existing = current.find((entry) => entry.id === id);
    if (existing) {
      return current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              seq: event.seq,
              text: `${entry.text}${text}`
            }
          : entry
      );
    }
  }

  const next: RuntimeOutputItem = {
    id,
    seq: event.seq,
    event: event.event,
    tone:
      event.event === 'item.delta' && event.payload.kind === 'agent_message'
        ? 'assistant'
        : outputTone(event),
    title: runtimeEventTitle(event),
    text: runtimeEventText(event),
    meta
  };

  const existingIndex = current.findIndex((entry) => entry.id === id);
  if (existingIndex >= 0) {
    const updated = [...current];
    updated[existingIndex] = next;
    return updated.sort((a, b) => a.seq - b.seq).slice(-200);
  }

  return [...current, next].sort((a, b) => a.seq - b.seq).slice(-200);
}

export function App() {
  const [runtimeUrl, setRuntimeUrl] = useState(storedRuntimeUrl);
  const [runtimeToken, setRuntimeToken] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(storedTheme);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('未连接');
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [providers, setProviders] = useState<ProvidersResponse | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [providerForm, setProviderForm] = useState<ProviderForm>({
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    persist: false
  });
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerMessage, setProviderMessage] = useState('');
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<ThreadRecord | null>(null);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [activeTurnStatus, setActiveTurnStatus] = useState<string>('idle');
  const [prompt, setPrompt] = useState('');
  const [turnBusy, setTurnBusy] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [runtimeOutputs, setRuntimeOutputs] = useState<RuntimeOutputItem[]>([]);
  const [filesPath, setFilesPath] = useState('');
  const [fileList, setFileList] = useState<WorkspaceFilesResponse | null>(null);
  const [filePreview, setFilePreview] = useState<WorkspaceFileContent | null>(null);
  const [teaching, setTeaching] = useState<TeachingEvent[]>([]);
  const [expandedTeaching, setExpandedTeaching] = useState<Set<string>>(() => new Set());
  const [lastTeachingSeq, setLastTeachingSeq] = useState(0);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const latestTeachingSeqRef = useRef(0);
  const latestRuntimeSeqRef = useRef(0);

  const connection = useMemo<RuntimeConnection>(
    () => ({ baseUrl: runtimeUrl.trim(), token: runtimeToken }),
    [runtimeUrl, runtimeToken]
  );
  const turnRunning = activeTurnStatus === 'queued' || activeTurnStatus === 'in_progress';

  const addLog = useCallback((kind: LogLine['kind'], text: string) => {
    setLogs((current) => [{ id: `${Date.now()}-${Math.random()}`, kind, text }, ...current].slice(0, 80));
  }, []);

  const refreshWorkspaceFiles = useCallback(
    async (path = filesPath) => {
      if (status !== 'connected') return;
      setLoadingFiles(true);
      try {
        const result = await workspaceFiles(connection, path);
        setFileList(result);
        setFilesPath(result.path);
      } catch (error) {
        addLog('error', error instanceof Error ? error.message : '文件列表加载失败');
      } finally {
        setLoadingFiles(false);
      }
    },
    [addLog, connection, filesPath, status]
  );

  const refreshThreads = useCallback(async () => {
    if (status !== 'connected') return;
    try {
      setThreads(await listThreads(connection));
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : '会话列表加载失败');
    }
  }, [addLog, connection, status]);

  const refreshTeaching = useCallback(
    async (threadId = activeThread?.id) => {
      if (!threadId || status !== 'connected') return;
      try {
        const result = await teachingEvents(connection, threadId);
        setTeaching(result.events);
        setLastTeachingSeq(result.latestSeq);
        latestTeachingSeqRef.current = result.latestSeq;
      } catch (error) {
        addLog('error', error instanceof Error ? error.message : '教学事件加载失败');
      }
    },
    [activeThread?.id, addLog, connection, status]
  );

  const connectRuntime = useCallback(async () => {
    if (!runtimeUrl.trim()) {
      setStatus('error');
      setStatusMessage('Runtime URL 不能为空');
      return;
    }
    setStatus('idle');
    setStatusMessage('连接中');
    localStorage.setItem(STORED_RUNTIME_URL, runtimeUrl.trim());
    try {
      const [info, workspaceResult, providerResult, threadResult] = await Promise.all([
        runtimeInfo(connection),
        workspaceStatus(connection),
        listProviders(connection),
        listThreads(connection)
      ]);
      setRuntime(info);
      setWorkspace(workspaceResult);
      setProviders(providerResult);
      setThreads(threadResult);
      setProviderForm((current) => ({
        ...current,
        provider: providerResult.current.provider,
        model: providerResult.current.model ?? current.model,
        baseUrl: providerResult.current.baseUrl ?? current.baseUrl
      }));
      setStatus('connected');
      setStatusMessage('已连接');
      addLog('success', 'Runtime API 已连接');
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : '连接失败');
    }
  }, [addLog, connection, runtimeUrl]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem(STORED_THEME, theme);
  }, [theme]);

  useEffect(() => {
    if (status === 'connected') {
      void refreshWorkspaceFiles('');
    }
  }, [refreshWorkspaceFiles, status]);

  useEffect(() => {
    if (!activeThread || status !== 'connected') return;
    void refreshTeaching(activeThread.id);
    const source = new EventSource(teachingEventsUrl(connection, activeThread.id, latestTeachingSeqRef.current));
    source.addEventListener('teaching.event', (event) => {
      const parsed = JSON.parse((event as MessageEvent).data) as TeachingEvent;
      setTeaching((current) => {
        if (current.some((item) => item.seq === parsed.seq)) return current;
        return [...current, parsed].sort((a, b) => a.seq - b.seq).slice(-300);
      });
      latestTeachingSeqRef.current = Math.max(latestTeachingSeqRef.current, parsed.seq);
      setLastTeachingSeq((seq) => Math.max(seq, parsed.seq));
    });
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [activeThread, connection, refreshTeaching, status]);

  useEffect(() => {
    if (!activeThread || status !== 'connected') return;
    setRuntimeOutputs([]);
    latestRuntimeSeqRef.current = 0;
    const source = new EventSource(threadEventsUrl(connection, activeThread.id, latestRuntimeSeqRef.current));
    const handleEvent = (event: MessageEvent) => {
      const parsed = JSON.parse(event.data) as RuntimeThreadEvent;
      if (parsed.seq <= latestRuntimeSeqRef.current) return;
      latestRuntimeSeqRef.current = parsed.seq;
      const turn = nestedRecord(parsed.payload.turn);
      if (turn?.id) {
        setActiveTurnId(String(turn.id));
      }
      if (turn?.status) {
        setActiveTurnStatus(String(turn.status));
      }
      setRuntimeOutputs((current) => mergeRuntimeOutput(current, parsed));
    };
    const eventNames = [
      'thread.started',
      'turn.started',
      'turn.lifecycle',
      'turn.steered',
      'turn.interrupt_requested',
      'turn.completed',
      'item.started',
      'item.delta',
      'item.completed',
      'item.failed',
      'item.interrupted',
      'approval.required',
      'approval.decided',
      'approval.timeout',
      'sandbox.denied'
    ];
    eventNames.forEach((name) => source.addEventListener(name, handleEvent));
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [activeThread, connection, status]);

  const selectProvider = (provider: ProviderCatalogEntry) => {
    setProviderForm((current) => ({
      ...current,
      provider: provider.id,
      model: provider.defaultModel ?? current.model,
      apiKey: ''
    }));
  };

  const toggleTeachingEvent = (id: string) => {
    setExpandedTeaching((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const prepareNewSession = () => {
    setActiveThread(null);
    setActiveTurnId(null);
    setActiveTurnStatus('idle');
    setRuntimeOutputs([]);
    setTeaching([]);
    setLastTeachingSeq(0);
    latestRuntimeSeqRef.current = 0;
    latestTeachingSeqRef.current = 0;
    addLog('info', '已准备新 Session，发送第一条消息后创建 Runtime thread');
  };

  const runProviderTest = async () => {
    setProviderBusy(true);
    setProviderMessage('测试中');
    try {
      const result = await testProvider(connection, providerForm);
      setProviderMessage(`测试通过：${result.provider} / ${result.model}`);
      addLog('success', 'Provider 测试通过');
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : 'Provider 测试失败');
    } finally {
      setProviderBusy(false);
    }
  };

  const applyProviderConnection = async () => {
    if (providerForm.persist && !window.confirm('确认把 provider 配置写入本机后端配置文件？')) {
      return;
    }
    setProviderBusy(true);
    setProviderMessage('应用中');
    try {
      const result = await applyProvider(connection, providerForm);
      setProviderMessage(`已应用：${result.provider} / ${result.model}`);
      const providerResult = await listProviders(connection);
      setProviders(providerResult);
      addLog('success', result.persisted ? 'Provider 已保存到本机配置' : 'Provider 已应用到当前 Runtime');
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : 'Provider 应用失败');
    } finally {
      setProviderBusy(false);
    }
  };

  const openEntry = async (entry: WorkspaceFileEntry) => {
    if (entry.kind === 'directory') {
      await refreshWorkspaceFiles(entry.path);
      return;
    }
    if (entry.kind !== 'file') return;
    try {
      setFilePreview(await workspaceFileContent(connection, entry.path));
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : '文件预览失败');
    }
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() || status !== 'connected') return;
    setTurnBusy(true);
    try {
      const thread = activeThread ?? (await createThread(connection, providerForm.model));
      setActiveThread(thread);
      const started = await startTurn(connection, thread.id, prompt.trim(), providerForm.model);
      setActiveThread(started.thread);
      setActiveTurnId(started.turn.id);
      setActiveTurnStatus(started.turn.status);
      addLog('info', `Turn started: ${started.turn.id}`);
      setPrompt('');
      await Promise.all([refreshThreads(), refreshTeaching(thread.id)]);
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : 'Prompt 发送失败');
    } finally {
      setTurnBusy(false);
    }
  };

  const interruptActiveTurn = async () => {
    if (!activeThread || !activeTurnId || !turnRunning) return;
    try {
      const turn = await interruptTurn(connection, activeThread.id, activeTurnId);
      setActiveTurnStatus(turn.status);
      addLog('info', `Turn interrupted: ${turn.id}`);
    } catch (error) {
      addLog('error', error instanceof Error ? error.message : '中断失败');
    }
  };

  return (
    <main className="console-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <h1>FuFan Teaching Console</h1>
            <p>编程 Agent 教学工作台</p>
          </div>
        </div>
        <div className="runtime-strip">
          <span className={`status-dot ${status}`} />
          <span>{statusText(status)}</span>
          <span className="muted">{statusMessage}</span>
          {runtime?.version && <span className="muted">v{String(runtime.version)}</span>}
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="切换主题"
          title="切换主题"
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </header>

      <section className="workspace-grid">
        <aside className="panel left-panel">
          <section className="section">
            <div className="section-title">
              <Server size={16} />
              <span>运行时</span>
            </div>
            <label>
              <span>URL</span>
              <input value={runtimeUrl} onChange={(event) => setRuntimeUrl(event.target.value)} />
            </label>
            <label>
              <span>Token</span>
              <input
                type="password"
                value={runtimeToken}
                onChange={(event) => setRuntimeToken(event.target.value)}
                placeholder="仅保存在当前页面内存"
              />
            </label>
            <button className="primary-button" type="button" onClick={connectRuntime}>
              <PlugZap size={16} />
              连接
            </button>
          </section>

          <section className="section compact">
            <div className="section-title">
              <GitBranch size={16} />
              <span>工作区</span>
            </div>
            {workspace ? (
              <div className="workspace-meta">
                <strong>{workspace.branch ?? 'no branch'}</strong>
                <span>{workspace.dirty ? 'dirty' : 'clean'}</span>
                <span>{workspace.staged} staged</span>
                <span>{workspace.untracked} untracked</span>
              </div>
            ) : (
              <p className="muted">等待连接运行时</p>
            )}
          </section>

          <section className="section session-section">
            <div className="section-title row-between">
              <span className="inline-title">
                <Database size={16} />
                会话
              </span>
              <span className="inline-title">
                <button className="secondary-button compact-button" type="button" onClick={prepareNewSession}>
                  <CirclePlus size={15} />
                  新建
                </button>
                <button className="secondary-button compact-button" type="button" onClick={() => void refreshThreads()}>
                  <RefreshCw size={15} />
                  刷新
                </button>
              </span>
            </div>
            <div className="thread-list">
              {threads.map((thread) => (
                <button
                  className={activeThread?.id === thread.id ? 'thread-item selected' : 'thread-item'}
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    setActiveThread({
                      id: thread.id,
                      model: thread.model ?? providerForm.model,
                      mode: thread.mode ?? 'chat',
                      workspace: thread.workspace ?? '',
                      latest_turn_status: thread.latest_turn_status
                    });
                    void refreshTeaching(thread.id);
                  }}
                >
                  <CircleDot size={13} />
                  <span>{thread.title ?? thread.preview ?? thread.id}</span>
                  <small>{thread.latest_turn_status ?? 'idle'}</small>
                </button>
              ))}
              {threads.length === 0 && <p className="muted">连接后显示历史会话</p>}
            </div>
          </section>

          <section className="section file-section">
            <div className="section-title row-between">
              <span className="inline-title">
                <Folder size={16} />
                文件
              </span>
              <button
                className="icon-button small"
                type="button"
                title="刷新文件"
                aria-label="刷新文件"
                onClick={() => void refreshWorkspaceFiles(filesPath)}
              >
                {loadingFiles ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
              </button>
            </div>
            {fileList?.parent !== undefined && (
              <button className="file-row parent" type="button" onClick={() => void refreshWorkspaceFiles(fileList.parent ?? '')}>
                <ChevronRight size={14} />
                ..
              </button>
            )}
            <div className="file-list">
              {fileList?.entries.map((entry) => (
                <button className="file-row" key={entry.path} type="button" onClick={() => void openEntry(entry)}>
                  {entry.kind === 'directory' ? <Folder size={15} /> : <FileText size={15} />}
                  <span>{entry.name}</span>
                  <small>{formatBytes(entry.size)}</small>
                </button>
              ))}
            </div>
            {filePreview && (
              <div className="preview">
                <div className="preview-head">
                  <FileText size={14} />
                  <span>{filePreview.path}</span>
                </div>
                {filePreview.kind === 'text' ? (
                  <pre>{filePreview.content}</pre>
                ) : (
                  <p className="muted">{filePreview.unsupportedReason ?? filePreview.kind}</p>
                )}
              </div>
            )}
          </section>
        </aside>

        <section className="panel center-panel">
          <section className="main-header">
            <div className="session-heading">
              <MessageSquare size={18} />
              <div>
                <h2>{activeThread ? threads.find((thread) => thread.id === activeThread.id)?.title ?? '当前会话' : '新会话'}</h2>
                <p>
                  {providerForm.provider} / {providerForm.model}
                </p>
              </div>
            </div>
            <div className="main-actions">
              <small className={turnRunning ? 'run-status running' : 'run-status'}>{activeTurnStatus}</small>
              <button
                className="secondary-button danger-button compact-button"
                type="button"
                onClick={() => void interruptActiveTurn()}
                disabled={!turnRunning}
              >
                <CircleAlert size={15} />
                中断
              </button>
              <button className="secondary-button compact-button" type="button" onClick={() => setProviderOpen((open) => !open)}>
                <Settings size={15} />
                模型设置
              </button>
            </div>
          </section>

          {providerOpen && (
            <section className="section provider-section">
              <div className="section-title">
                <Settings size={16} />
                <span>模型接入</span>
              </div>
              <div className="provider-grid">
                <div className="provider-list">
                  {providers?.providers.map((provider) => (
                    <button
                      className={providerForm.provider === provider.id ? 'provider-item selected' : 'provider-item'}
                      key={provider.id}
                      type="button"
                      onClick={() => selectProvider(provider)}
                    >
                      <Bot size={15} />
                      <span>{provider.label}</span>
                      {provider.apiKeyConfigured && <Check size={14} />}
                    </button>
                  ))}
                </div>
                <div className="provider-form">
                  <label>
                  <span>服务商</span>
                    <input
                      value={providerForm.provider}
                      onChange={(event) => setProviderForm({ ...providerForm, provider: event.target.value })}
                    />
                  </label>
                  <label>
                  <span>模型</span>
                    <input
                      value={providerForm.model}
                      onChange={(event) => setProviderForm({ ...providerForm, model: event.target.value })}
                    />
                  </label>
                  <label>
                  <span>接口地址</span>
                    <input
                      value={providerForm.baseUrl}
                      onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })}
                    />
                  </label>
                  <label>
                  <span>API Key</span>
                    <input
                      type="password"
                      value={providerForm.apiKey}
                      onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })}
                      placeholder="不会存入浏览器"
                    />
                  </label>
                  <label className="checkline">
                    <input
                      type="checkbox"
                      checked={providerForm.persist}
                      onChange={(event) => setProviderForm({ ...providerForm, persist: event.target.checked })}
                    />
                    <span>写入本机后端配置</span>
                  </label>
                  <div className="button-row">
                    <button className="secondary-button" type="button" onClick={() => void runProviderTest()} disabled={providerBusy}>
                      <TestTube2 size={16} />
                      测试
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void applyProviderConnection()}
                      disabled={providerBusy}
                    >
                      <KeyRound size={16} />
                      应用
                    </button>
                  </div>
                  <p className="status-line">{providerMessage || providers?.current.provider}</p>
                </div>
              </div>
            </section>
          )}

          <section className="section output-section">
            <div className="section-title row-between">
              <span className="inline-title">
                <Activity size={16} />
                会话输出
              </span>
              <span className="muted">实时运行流</span>
            </div>
            <div className="output-list">
              {runtimeOutputs.map((item) => (
                <article className={`output-item ${item.tone}`} key={item.id}>
                  <div className="output-head">
                    {item.tone === 'error' ? <CircleAlert size={14} /> : <Terminal size={14} />}
                    <strong>{item.title}</strong>
                    <small>#{item.seq}</small>
                  </div>
                  {item.text && <pre className="output-body">{item.text}</pre>}
                  {item.meta && <p>{item.meta}</p>}
                </article>
              ))}
              {runtimeOutputs.length === 0 && logs.length === 0 && <p className="muted">选择会话或发送任务后显示实时对话</p>}
              {logs.map((line) => (
                <div className={`log-line ${line.kind}`} key={line.id}>
                  {line.kind === 'error' ? <CircleAlert size={14} /> : <Terminal size={14} />}
                  <span>{line.text}</span>
                </div>
              ))}
            </div>
          </section>

          <form className="composer" onSubmit={submitPrompt}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="输入要交给 Agent 执行的任务"
            />
            <button className="primary-button send-button" type="submit" disabled={turnBusy || turnRunning || status !== 'connected'}>
              {turnBusy ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}
              发送
            </button>
          </form>
        </section>

        <aside className="panel right-panel">
          <section className="section timeline-section">
            <div className="section-title">
              <Sparkles size={16} />
              <span>教学讲解</span>
            </div>
            <div className="active-thread">
              <Shield size={15} />
              <span>{activeThread?.id ?? '未选择会话'}</span>
              {lastTeachingSeq > 0 && <small>latest #{lastTeachingSeq}</small>}
            </div>
            <div className="timeline">
              {teaching.map((event) => {
                const meta = teachingCategoryMeta(event);
                const Icon = meta.Icon;
                return (
                  <article className={`timeline-item ${eventTone(event.severity)} ${meta.className}`} key={event.id}>
                    <button className="timeline-toggle" type="button" onClick={() => toggleTeachingEvent(event.id)}>
                      <span className="timeline-head">
                        <span className="timeline-badge">
                          <Icon size={13} />
                          {meta.label}
                        </span>
                        <small>#{event.seq}</small>
                      </span>
                      <h3>{teachingReadableSummary(event)}</h3>
                      <p>{teachingReadableDetail(event)}</p>
                      <ChevronRight size={15} className={expandedTeaching.has(event.id) ? 'chevron open' : 'chevron'} />
                    </button>
                    {expandedTeaching.has(event.id) && (
                      <div className="timeline-detail-wrap">
                        <div className="timeline-detail-meta">
                          {event.type} · {event.category}
                        </div>
                        <pre className="timeline-detail">{JSON.stringify(event.data, null, 2)}</pre>
                      </div>
                    )}
                  </article>
                );
              })}
              {teaching.length === 0 && <p className="muted">选择会话后显示教学讲解</p>}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
