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
// --- SDK ---
export class GatherPlugin {
    constructor() {
        this.pendingRequests = new Map();
        this.requestCounter = 0;
        // Read params injected by the Gather host
        const params = new URLSearchParams(window.location.search);
        this.token = params.get("token") ?? "";
        // The Gather host passes its origin as hostUrl so proxy API calls
        // go to the correct server (not the plugin's own origin).
        const hostUrl = params.get("hostUrl");
        if (hostUrl) {
            this.baseUrl = hostUrl;
        }
        else if (window.parent !== window && document.referrer) {
            this.baseUrl = new URL(document.referrer).origin;
        }
        else {
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
    async pickPlot(options) {
        return this.postToHost("gather:pickPlot", {
            mode: options?.mode ?? "input",
            title: options?.title ?? "Select a plot",
        });
    }
    /** List files in a plot. Requires files:read scope. */
    async listFiles(plotId) {
        // Route through postMessage so the host (which has the session cookie)
        // makes the API call — avoids cross-site cookie issues.
        const res = await this.postToHost("gather:listFiles", { plotId });
        return res.files;
    }
    /**
     * Upload a file to a plot via the Gather host.
     * Accepts a base64 data URL. Returns the file ID and thumbnail URL.
     */
    async uploadFile(plotId, fileName, dataUrl) {
        const res = await this.postToHost("gather:uploadFile", {
            plotId,
            fileName,
            dataUrl,
        });
        return res;
    }
    /**
     * Proxy an image URL through the Gather host.
     * Returns a base64 data URL. Useful for loading Google Drive thumbnails
     * which are not accessible via direct cross-origin fetch.
     */
    async proxyImageUrl(url) {
        const res = await this.postToHost("gather:proxyImage", { url });
        return res.dataUrl;
    }
    /** List all plots the user has access to. Requires plots:read scope. */
    async listPlots() {
        const res = await this.proxyFetch("/api/plugin-proxy/plots");
        return res.plots;
    }
    /** Add a comment to a target in a plot. Requires comments:write scope. */
    async addComment(plotId, options) {
        return this.proxyFetch(`/api/plugin-proxy/plots/${plotId}/comments`, {
            method: "POST",
            body: JSON.stringify(options),
        });
    }
    // --- Presets API ---
    /**
     * List all presets saved by this plugin in the workspace.
     * Requires scope: presets:read
     */
    async listPresets() {
        const res = await this.proxyFetch("/api/plugin-proxy/presets");
        return res.presets;
    }
    /**
     * Get a single preset by its key.
     * Returns null if the preset does not exist.
     * Requires scope: presets:read
     */
    async getPreset(key) {
        try {
            const res = await this.proxyFetch(`/api/plugin-proxy/presets/${encodeURIComponent(key)}`);
            return res.preset;
        }
        catch {
            return null;
        }
    }
    /**
     * Create or update a preset. If a preset with the given key already exists,
     * it will be overwritten.
     * Requires scope: presets:write
     */
    async savePreset(options) {
        const res = await this.proxyFetch("/api/plugin-proxy/presets", {
            method: "POST",
            body: JSON.stringify(options),
        });
        return res.preset;
    }
    /**
     * Delete a preset by its key.
     * Requires scope: presets:write
     */
    async deletePreset(key) {
        await this.proxyFetch(`/api/plugin-proxy/presets/${encodeURIComponent(key)}`, {
            method: "DELETE",
        });
    }
    /** Get a service proxy for making proxied calls to workspace services. */
    service(serviceName) {
        return {
            isAvailable: async () => {
                const res = await this.proxyFetch(`/api/plugin-proxy/services/${serviceName}`);
                return res.available;
            },
            call: async (action, params) => {
                return this.proxyFetch(`/api/plugin-proxy/services/${serviceName}`, {
                    method: "POST",
                    body: JSON.stringify({ action, params }),
                });
            },
        };
    }
    // --- Internal ---
    postToHost(type, payload) {
        const requestId = `req_${++this.requestCounter}_${Date.now()}`;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
            window.parent.postMessage({ type, requestId, payload }, "*");
            // Timeout after 60 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error(`Request ${type} timed out`));
                }
            }, 60000);
        });
    }
    handleMessage(event) {
        const msg = event.data;
        if (msg?.type !== "gather:response" || !msg.requestId)
            return;
        const pending = this.pendingRequests.get(msg.requestId);
        if (!pending)
            return;
        this.pendingRequests.delete(msg.requestId);
        if (msg.ok) {
            pending.resolve(msg.data);
        }
        else {
            pending.reject(new Error(msg.error ?? "Request failed"));
        }
    }
    async proxyFetch(path, init) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            credentials: "include",
            headers: {
                ...(init?.headers ?? {}),
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
