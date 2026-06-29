import type {
  ApiErrorBody,
  CreateTurnResponse,
  ProviderConnectionRequest,
  ProviderConnectionResponse,
  ProvidersResponse,
  RuntimeConnection,
  RuntimeInfo,
  TeachingEventsResponse,
  ThreadRecord,
  ThreadSummary,
  WorkspaceFileContent,
  WorkspaceFilesResponse,
  WorkspaceStatus
} from './types';

export class RuntimeApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

async function requestJson<T>(
  connection: RuntimeConnection,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (connection.token.trim()) {
    headers.set('authorization', `Bearer ${connection.token.trim()}`);
  }

  const response = await fetch(`${normalizeBaseUrl(connection.baseUrl)}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = undefined;
    }
    throw new RuntimeApiError(
      body?.error?.message ?? `Runtime API request failed (${response.status})`,
      response.status,
      body?.error?.code
    );
  }

  return (await response.json()) as T;
}

export function runtimeInfo(connection: RuntimeConnection): Promise<RuntimeInfo> {
  return requestJson<RuntimeInfo>(connection, '/v1/runtime/info');
}

export function workspaceStatus(connection: RuntimeConnection): Promise<WorkspaceStatus> {
  return requestJson<WorkspaceStatus>(connection, '/v1/workspace/status');
}

export function workspaceFiles(
  connection: RuntimeConnection,
  path = ''
): Promise<WorkspaceFilesResponse> {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  return requestJson<WorkspaceFilesResponse>(connection, `/v1/workspace/files${query}`);
}

export function workspaceFileContent(
  connection: RuntimeConnection,
  path: string
): Promise<WorkspaceFileContent> {
  return requestJson<WorkspaceFileContent>(
    connection,
    `/v1/workspace/files/content?path=${encodeURIComponent(path)}`
  );
}

export function listProviders(connection: RuntimeConnection): Promise<ProvidersResponse> {
  return requestJson<ProvidersResponse>(connection, '/v1/providers');
}

export function testProvider(
  connection: RuntimeConnection,
  body: ProviderConnectionRequest
): Promise<ProviderConnectionResponse> {
  return requestJson<ProviderConnectionResponse>(connection, '/v1/providers/test', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function applyProvider(
  connection: RuntimeConnection,
  body: ProviderConnectionRequest
): Promise<ProviderConnectionResponse> {
  return requestJson<ProviderConnectionResponse>(connection, '/v1/providers/connection', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function listThreads(connection: RuntimeConnection): Promise<ThreadSummary[]> {
  return requestJson<ThreadSummary[]>(connection, '/v1/threads/summary');
}

export function createThread(connection: RuntimeConnection, model: string): Promise<ThreadRecord> {
  return requestJson<ThreadRecord>(connection, '/v1/threads', {
    method: 'POST',
    body: JSON.stringify({
      model,
      mode: 'chat',
      allow_shell: false,
      trust_mode: false,
      auto_approve: false
    })
  });
}

export function startTurn(
  connection: RuntimeConnection,
  threadId: string,
  prompt: string,
  model: string
): Promise<CreateTurnResponse> {
  return requestJson<CreateTurnResponse>(connection, `/v1/threads/${threadId}/turns`, {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      model,
      mode: 'chat',
      allow_shell: false,
      trust_mode: false,
      auto_approve: false
    })
  });
}

export function interruptTurn(
  connection: RuntimeConnection,
  threadId: string,
  turnId: string
): Promise<CreateTurnResponse['turn']> {
  return requestJson<CreateTurnResponse['turn']>(connection, `/v1/threads/${threadId}/turns/${turnId}/interrupt`, {
    method: 'POST'
  });
}

export function teachingEvents(
  connection: RuntimeConnection,
  threadId: string,
  afterSeq?: number
): Promise<TeachingEventsResponse> {
  const query = afterSeq ? `?afterSeq=${afterSeq}` : '';
  return requestJson<TeachingEventsResponse>(
    connection,
    `/v1/threads/${threadId}/teaching-events${query}`
  );
}

export function teachingEventsUrl(connection: RuntimeConnection, threadId: string, afterSeq = 0): string {
  const params = new URLSearchParams({ afterSeq: String(afterSeq) });
  if (connection.token.trim()) {
    params.set('token', connection.token.trim());
  }
  return `${normalizeBaseUrl(connection.baseUrl)}/v1/threads/${threadId}/teaching-events/stream?${params.toString()}`;
}

export function threadEventsUrl(
  connection: RuntimeConnection,
  threadId: string,
  sinceSeq = 0,
  replayLimit = 200
): string {
  const params = new URLSearchParams({
    since_seq: String(sinceSeq),
    replay_limit: String(replayLimit)
  });
  if (connection.token.trim()) {
    params.set('token', connection.token.trim());
  }
  return `${normalizeBaseUrl(connection.baseUrl)}/v1/threads/${threadId}/events?${params.toString()}`;
}
