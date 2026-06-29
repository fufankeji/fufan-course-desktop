# Runtime API Contracts

Date: 2026-06-18

## Status

Draft contract for Feature 001 implementation.

These contracts define the new or expanded Runtime API surface required by the
Web Runtime Console. Existing Runtime APIs for runtime info, threads, turns,
SSE runtime events, interrupt, Skills, MCP, approvals, and workspace git status
remain in use.

All `/v1/*` endpoints use the existing Runtime API auth behavior. When auth is
enabled, clients must send the Runtime bearer token or the existing supported
runtime token header.

## Error Shape

New Feature 001 endpoints should use a consistent JSON error shape:

```json
{
  "error": {
    "code": "workspace_path_escape",
    "message": "Path must stay inside the active workspace.",
    "details": {
      "path": "../secret.txt"
    }
  }
}
```

Guidelines:

- `code` is stable and machine-readable.
- `message` is safe for Web UI display.
- `details` must not include API keys, sensitive headers, raw request bodies, or
  sensitive file content.

## Workspace Files

### `GET /v1/workspace/files`

Returns immediate children for one workspace directory. This endpoint is lazy:
the frontend requests one directory at a time.

Query parameters:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | No | Workspace-relative directory path. Empty or omitted means workspace root. |

Response:

```json
{
  "workspace": "/Users/example/project",
  "path": "src",
  "parent": "",
  "entries": [
    {
      "name": "main.rs",
      "path": "src/main.rs",
      "kind": "file",
      "size": 2842,
      "modifiedAt": "2026-06-18T10:20:30Z"
    },
    {
      "name": "components",
      "path": "src/components",
      "kind": "directory",
      "hasChildren": true,
      "modifiedAt": "2026-06-18T10:18:00Z"
    }
  ]
}
```

Entry fields:

- `name`: base filename.
- `path`: workspace-relative path.
- `kind`: `file`, `directory`, `symlink`, or `other`.
- `size`: byte size when cheap and meaningful.
- `modifiedAt`: ISO timestamp when available.
- `hasChildren`: optional hint for directories.

Behavior:

- Must reject path traversal or workspace escape attempts.
- Must sort directories first, then files, both by name.
- Must hide heavy or low-value directories by default, including `.git`,
  `target`, `node_modules`, and common build artifacts.
- Filtering happens in the backend, not only in the browser.

Path escape error example:

```json
{
  "error": {
    "code": "workspace_path_escape",
    "message": "Path must stay inside the active workspace.",
    "details": {
      "path": "../secret.txt"
    }
  }
}
```

### `GET /v1/workspace/files/content`

Returns bounded read-only preview data for one workspace file.

Query parameters:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `path` | string | Yes | Workspace-relative file path. |

Text response:

```json
{
  "path": "src/main.rs",
  "kind": "text",
  "encoding": "utf-8",
  "size": 2842,
  "truncated": false,
  "maxBytes": 204800,
  "content": "fn main() {\n    println!(\"hello\");\n}\n"
}
```

Truncated text response:

```json
{
  "path": "logs/app.log",
  "kind": "text",
  "encoding": "utf-8",
  "size": 734912,
  "truncated": true,
  "maxBytes": 204800,
  "content": "..."
}
```

Binary or unsupported response:

```json
{
  "path": "assets/logo.png",
  "kind": "binary",
  "size": 48120,
  "truncated": false,
  "maxBytes": 204800,
  "content": null,
  "unsupportedReason": "binary_file"
}
```

Behavior:

- Must return JSON, not raw file content.
- Must cap text preview at 200KB.
- Must not return raw binary content in Feature 001.
- Must reject path traversal or workspace escape attempts.
- Must not support writes, edits, deletes, or save operations.

## Providers

### `GET /v1/providers`

Returns the backend-supported provider catalog and current provider/model state.
The frontend must render provider choices from this response instead of
hard-coding a small Web-only provider subset.

Response:

```json
{
  "current": {
    "provider": "openai",
    "model": "gpt-5-codex",
    "baseUrl": "https://api.openai.com/v1",
    "apiKeyConfigured": true
  },
  "providers": [
    {
      "id": "openai",
      "label": "OpenAI",
      "supportsBaseUrl": true,
      "requiresApiKey": true,
      "apiKeyConfigured": true,
      "defaultModel": "gpt-5-codex"
    },
    {
      "id": "ollama",
      "label": "Ollama",
      "supportsBaseUrl": true,
      "requiresApiKey": false,
      "apiKeyConfigured": true,
      "defaultModel": "qwen3-coder"
    }
  ]
}
```

Security:

- Must never return raw API keys.
- Must not return masked key fragments such as last four characters.
- Use `apiKeyConfigured` only.

### `POST /v1/providers/test`

Tests provider/model/base URL/API key inputs without persistence.

Request:

```json
{
  "provider": "openai",
  "model": "gpt-5-codex",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-..."
}
```

Success response:

```json
{
  "ok": true,
  "provider": "openai",
  "model": "gpt-5-codex",
  "baseUrlHost": "api.openai.com",
  "apiKeyConfigured": true
}
```

Failure response:

```json
{
  "error": {
    "code": "provider_connection_failed",
    "message": "Provider connection failed: unauthorized.",
    "details": {
      "provider": "openai",
      "model": "gpt-5-codex",
      "baseUrlHost": "api.openai.com",
      "errorClass": "unauthorized"
    }
  }
}
```

Security:

- Must not persist credentials.
- Must not log raw API keys, sensitive headers, or full request bodies.
- Redacted logs may include provider, model, base URL host, and error class.
- Must not echo raw API keys or masked key fragments in responses.

### `POST /v1/providers/connection`

Applies a confirmed provider connection to the active Runtime process/session
path and optionally persists it to the local backend configuration file.

Request:

```json
{
  "provider": "openai",
  "model": "gpt-5-codex",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "persist": true
}
```

Response:

```json
{
  "ok": true,
  "provider": "openai",
  "model": "gpt-5-codex",
  "baseUrl": "https://api.openai.com/v1",
  "apiKeyConfigured": true,
  "persisted": true
}
```

Behavior:

- `persist: false` applies credentials only for the active Runtime
  process/session path.
- `persist: true` writes confirmed settings to the local backend configuration
  file.
- The Web UI must require explicit user confirmation before sending
  `persist: true`.
- The browser must not store model API keys in local storage.
- Runtime API responses must never echo raw API keys or masked key fragments.

## Structured Teaching Events

Feature 001 uses structured `EducationEvent`-style backend data for the right
teaching timeline. The Web UI should not rely only on frontend-derived mappings
from generic runtime events.

### `GET /v1/threads/{id}/teaching-events`

Returns bounded historical teaching events for one Runtime thread/session.

Query parameters:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | number | No | Maximum events to return. |
| `afterSeq` | number | No | Return events with `seq` greater than this value. |
| `since` | string | No | Optional ISO timestamp lower bound. |

Response:

```json
{
  "threadId": "thread_123",
  "latestSeq": 42,
  "events": [
    {
      "seq": 40,
      "id": "edu-40",
      "sessionId": "thread_123",
      "type": "shell-started",
      "timestamp": "2026-06-18T10:20:30Z",
      "category": "Shell",
      "actor": "agent",
      "visibility": "student",
      "severity": "info",
      "summary": "Started shell command npm test",
      "data": {
        "tool_id": "tool_1",
        "command": "npm test"
      }
    }
  ]
}
```

Requirements:

- Each event must have a stable monotonically increasing `seq` per thread.
- `seq` is used for ordering, de-duplication, and reconnect/backlog requests.
- Categories must include Skills, Tools, Shell, Files, Context, and Safety.
- Events can include teacher/internal visibility in Feature 001 because this is
  teacher-operated local use.
- All event payloads must be redacted before reaching the Web UI.

### `GET /v1/threads/{id}/teaching-events/stream`

SSE stream for new structured teaching events.

Event payload example:

```json
{
  "seq": 43,
  "id": "edu-43",
  "sessionId": "thread_123",
  "type": "file-read",
  "timestamp": "2026-06-18T10:21:00Z",
  "category": "Files",
  "actor": "agent",
  "visibility": "student",
  "severity": "info",
  "summary": "Read src/main.rs",
  "data": {
    "tool_id": "tool_2",
    "tool_name": "read_file",
    "path": "src/main.rs",
    "success": true
  }
}
```

SSE behavior:

- The client should request historical events first, then subscribe to the SSE
  stream.
- On reconnect, the client should use the last seen `seq` with the historical
  endpoint to fill gaps.
- SSE payloads must use the same schema as historical events.

## Browser Storage Policy

Allowed:

- Runtime URL may be persisted for convenience.
- Theme preference may be persisted because it is not a secret.

Not allowed:

- Runtime auth token must not be persisted in local storage.
- Model API keys must not be persisted in browser storage.
- Raw API keys must not appear in Web UI, Runtime API responses, logs, or
  teaching event payloads.
