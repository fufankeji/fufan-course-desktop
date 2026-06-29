export type RuntimeConnection = {
  baseUrl: string;
  token: string;
};

export type RuntimeInfo = {
  version?: string;
  apiVersion?: string;
  capabilities?: Record<string, unknown>;
  workspace?: string;
  [key: string]: unknown;
};

export type WorkspaceStatus = {
  workspace: string;
  git_repo: boolean;
  branch?: string | null;
  head?: string | null;
  dirty: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  ahead?: number | null;
  behind?: number | null;
};

export type WorkspaceFileEntry = {
  name: string;
  path: string;
  kind: 'directory' | 'file' | 'symlink' | 'other';
  size?: number;
  modifiedAt?: string;
  hasChildren?: boolean;
};

export type WorkspaceFilesResponse = {
  workspace: string;
  path: string;
  parent?: string | null;
  entries: WorkspaceFileEntry[];
};

export type WorkspaceFileContent = {
  path: string;
  kind: 'text' | 'binary' | 'unreadable';
  encoding?: string;
  size: number;
  truncated: boolean;
  maxBytes: number;
  content: string | null;
  unsupportedReason?: string;
};

export type ProviderCatalogEntry = {
  id: string;
  label: string;
  supportsBaseUrl: boolean;
  requiresApiKey: boolean;
  apiKeyConfigured: boolean;
  defaultModel?: string;
};

export type ProvidersResponse = {
  current: {
    provider: string;
    model?: string;
    baseUrl?: string;
    apiKeyConfigured: boolean;
  };
  providers: ProviderCatalogEntry[];
};

export type ProviderConnectionRequest = {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  persist?: boolean;
};

export type ProviderConnectionResponse = {
  ok: boolean;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKeyConfigured: boolean;
  persisted?: boolean;
  baseUrlHost?: string;
};

export type ThreadSummary = {
  id: string;
  title?: string | null;
  preview?: string | null;
  model?: string;
  mode?: string;
  workspace?: string;
  updated_at?: string;
  latest_turn_status?: string | null;
};

export type ThreadRecord = {
  id: string;
  model: string;
  mode: string;
  workspace: string;
  updated_at?: string;
  latest_turn_status?: string | null;
};

export type TurnRecord = {
  id: string;
  thread_id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'interrupted' | 'canceled';
  input_summary: string;
  created_at: string;
  error?: string | null;
};

export type CreateTurnResponse = {
  thread: ThreadRecord;
  turn: TurnRecord;
};

export type TeachingEvent = {
  seq: number;
  id: string;
  sessionId: string;
  type: string;
  timestamp: string;
  category: string;
  actor: string;
  visibility: string;
  severity: string;
  summary: string;
  data: Record<string, unknown>;
};

export type TeachingEventsResponse = {
  threadId: string;
  latestSeq: number;
  events: TeachingEvent[];
};

export type RuntimeThreadEvent = {
  schema_version: number;
  seq: number;
  event: string;
  kind: string;
  thread_id: string;
  turn_id?: string | null;
  item_id?: string | null;
  timestamp: string;
  created_at?: string;
  payload: Record<string, unknown>;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    status?: number;
  };
};
