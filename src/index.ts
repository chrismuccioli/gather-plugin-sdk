/**
 * @gather/plugin-sdk
 *
 * Tiny SDK for building Gather plugins.
 * Include this in your plugin's entry point to communicate with the Gather host.
 *
 * Usage:
 *   import { GatherPlugin } from "@gather/plugin-sdk";
 *   const gather = new GatherPlugin();
 *   const plot = await gather.pickPlot({ mode: "input", title: "Select source" });
 *   const files = await gather.listFiles(plot.id);
 */

// --- Types ---

export interface Plot {
  id: string;
  name: string;
  driveFolderId: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  modifiedTime: string;
}

export interface CreateFileOptions {
  name: string;
  content: Blob | string;
  mimeType: string;
}

export interface AddCommentOptions {
  targetType: "video" | "image" | "audio" | "external" | "note" | "figma";
  targetId: string;
  text: string;
  targetName?: string;
  parentId?: string;
  timecodeMs?: number;
}

export interface ServiceProxy {
  /** Check if a service is available in the workspace. */
  isAvailable(): Promise<boolean>;
  /** Call a service action (proxied through Gather — raw keys are never exposed). */
  call(action: string, params?: Record<string, unknown>): Promise<unknown>;
}

interface GatherResponse {
  type: "gather:response";
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

// --- SDK ---

export class GatherPlugin {
  private token: string;
  private baseUrl: string;
  private pendingRequests = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private requestCounter = 0;

  constructor() {
    // Read params injected by the Gather host
    const params = new URLSearchParams(window.location.search);
    this.token = params.get("token") ?? "";

    // The Gather host passes its origin as hostUrl so proxy API calls
    // go to the correct server (not the plugin's own origin).
    const hostUrl = params.get("hostUrl");
    if (hostUrl) {
      this.baseUrl = hostUrl;
    } else if (window.parent !== window && document.referrer) {
      this.baseUrl = new URL(document.referrer).origin;
    } else {
      this.baseUrl = window.location.origin;
    }

    // Listen for responses from the Gather host
    window.addEventListener("message", this.handleMessage.bind(this));

    // Signal ready
    this.postToHost("gather:ready", {});
  }

  // --- Public API ---

  /**
   * Open the native Gather plot picker.
   * Returns the selected plot, or throws if the user cancels.
   */
  async pickPlot(options?: { mode?: "input" | "output"; title?: string }): Promise<Plot> {
    return this.postToHost("gather:pickPlot", {
      mode: options?.mode ?? "input",
      title: options?.title ?? "Select a plot",
    }) as Promise<Plot>;
  }

  /** List files in a plot. Requires files:read scope. */
  async listFiles(plotId: string): Promise<DriveFile[]> {
    // Route through postMessage so the host (which has the session cookie)
    // makes the API call — avoids cross-site cookie issues.
    const res = await this.postToHost("gather:listFiles", { plotId });
    return (res as { files: DriveFile[] }).files;
  }

  /**
   * Upload a file to a plot via the Gather host.
   * Accepts a base64 data URL. Returns the file ID and thumbnail URL.
   */
  async uploadFile(
    plotId: string,
    fileName: string,
    dataUrl: string
  ): Promise<{ fileId: string; thumbnailUrl: string }> {
    const res = await this.postToHost("gather:uploadFile", {
      plotId,
      fileName,
      dataUrl,
    });
    return res as { fileId: string; thumbnailUrl: string };
  }

  /**
   * Proxy an image URL through the Gather host.
   * Returns a base64 data URL. Useful for loading Google Drive thumbnails
   * which are not accessible via direct cross-origin fetch.
   */
  async proxyImageUrl(url: string): Promise<string> {
    const res = await this.postToHost("gather:proxyImage", { url });
    return (res as { dataUrl: string }).dataUrl;
  }

  /** List all plots the user has access to. Requires plots:read scope. */
  async listPlots(): Promise<Plot[]> {
    const res = await this.proxyFetch("/api/plugin-proxy/plots");
    return (res as { plots: Plot[] }).plots;
  }

  /** Add a comment to a target in a plot. Requires comments:write scope. */
  async addComment(plotId: string, options: AddCommentOptions): Promise<unknown> {
    return this.proxyFetch(`/api/plugin-proxy/plots/${plotId}/comments`, {
      method: "POST",
      body: JSON.stringify(options),
    });
  }

  /** Get a service proxy for making proxied calls to workspace services. */
  service(serviceName: string): ServiceProxy {
    return {
      isAvailable: async () => {
        const res = await this.proxyFetch(
          `/api/plugin-proxy/services/${serviceName}`
        );
        return (res as { available: boolean }).available;
      },
      call: async (action: string, params?: Record<string, unknown>) => {
        return this.proxyFetch(`/api/plugin-proxy/services/${serviceName}`, {
          method: "POST",
          body: JSON.stringify({ action, params }),
        });
      },
    };
  }

  // --- Internal ---

  private postToHost(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const requestId = `req_${++this.requestCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });

      window.parent.postMessage(
        { type, requestId, payload },
        "*"
      );

      // Timeout after 60 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Request ${type} timed out`));
        }
      }, 60_000);
    });
  }

  private handleMessage(event: MessageEvent) {
    const msg = event.data as GatherResponse;
    if (msg?.type !== "gather:response" || !msg.requestId) return;

    const pending = this.pendingRequests.get(msg.requestId);
    if (!pending) return;

    this.pendingRequests.delete(msg.requestId);

    if (msg.ok) {
      pending.resolve(msg.data);
    } else {
      pending.reject(new Error(msg.error ?? "Request failed"));
    }
  }

  private async proxyFetch(
    path: string,
    init?: RequestInit
  ): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...((init?.headers as Record<string, string>) ?? {}),
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? `Request failed with status ${res.status}`);
    }

    return res.json();
  }
}
