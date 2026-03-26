# @gather/plugin-sdk

SDK for building [Gather](https://github.com/chrismuccioli/gather-app) plugins. A plugin is a web app that runs inside a sandboxed iframe in the Gather UI and communicates with the host via this SDK.

## Install

```bash
npm install chrismuccioli/gather-plugin-sdk
```

## Quick Start

```ts
import { GatherPlugin } from "@gather/plugin-sdk";

const gather = new GatherPlugin();

// Pick a source plot
const plot = await gather.pickPlot({ title: "Select source" });

// List its files
const files = await gather.listFiles(plot.id);

// Upload a new file
await gather.uploadFile(plot.id, "output.png", canvasDataUrl);
```

## API Reference

### `new GatherPlugin()`

Initializes the SDK. Reads the auth token and host URL from query params injected by the Gather host. Signals `gather:ready` to the host automatically.

### `gather.pickPlot(options?)`

Opens the native Gather plot picker modal.

- `options.mode` — `"input"` (default) or `"output"`
- `options.title` — custom title for the picker
- Returns: `Promise<Plot>` — `{ id, name, driveFolderId }`

### `gather.listFiles(plotId)`

Lists files in a plot's Google Drive folder. Routed through `postMessage` to avoid cross-site cookie issues.

- Returns: `Promise<DriveFile[]>`

### `gather.listPlots()`

Lists all plots the user has access to.

- Returns: `Promise<Plot[]>`

### `gather.uploadFile(plotId, fileName, dataUrl)`

Uploads a file to a plot's Drive folder. Accepts a base64 data URL.

- Returns: `Promise<{ fileId: string, thumbnailUrl: string }>`

### `gather.proxyImageUrl(url)`

Proxies a Google Drive thumbnail URL through Gather's server (avoids CORS). Returns a base64 data URL.

- Returns: `Promise<string>`

### `gather.addComment(plotId, options)`

Creates a comment on a file or asset. Shows up in the Activity panel and triggers notifications.

- `options.targetType` — `"video" | "image" | "audio" | "external" | "note" | "figma"`
- `options.targetId` — the asset's Drive file ID
- `options.text` — comment body
- `options.parentId?` — for threaded replies
- `options.timecodeMs?` — for video/audio comments
- Returns: `Promise<unknown>`

### `gather.service(name)`

Returns a proxy for a workspace service (Mux, Gemini, etc.). Raw API keys are never exposed to the plugin.

```ts
const gemini = gather.service("gemini");
const available = await gemini.isAvailable();
const result = await gemini.call("analyze", { prompt: "..." });
```

## Plugin Manifest

Every plugin needs a `gather-plugin.json` hosted at a public URL:

```json
{
  "name": "My Plugin",
  "icon": "pencil-line",
  "description": "What it does",
  "entryUrl": "https://my-plugin.vercel.app",
  "scopes": ["plots:read", "files:read", "files:write"],
  "version": "1.0.0"
}
```

### Scopes

| Scope | Description | Min Role |
|-------|-------------|----------|
| `plots:read` | List plots in the workspace | Viewer |
| `plots:write` | Create or modify plots | Editor |
| `files:read` | Read files from plot Drive folders | Viewer |
| `files:write` | Upload or create files in plot Drive folders | Editor |
| `comments:write` | Create comments and trigger notifications | Editor |
| `services:<name>` | Access a workspace service (e.g. `services:gemini`) | Editor |

## Types

```ts
interface Plot {
  id: string;
  name: string;
  driveFolderId: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  modifiedTime: string;
}
```

## Example Plugin

See [FL Paint](https://github.com/chrismuccioli/gather-fl-paint) — a retro MS Paint-style image editor that uses this SDK.

## Security

- Plugins run in a sandboxed iframe (`allow-scripts allow-same-origin allow-forms allow-popups allow-modals`)
- Each session gets a short-lived token (1 hour) scoped to the plugin's declared permissions intersected with the user's workspace role
- Workspace service keys (Mux, Gemini, etc.) are never exposed to plugins — Gather proxies all calls

## License

MIT
