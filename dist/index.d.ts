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
export declare class GatherPlugin {
    private token;
    private baseUrl;
    private pendingRequests;
    private requestCounter;
    constructor();
    /**
     * Open the native Gather plot picker.
     * Returns the selected plot, or throws if the user cancels.
     */
    pickPlot(options?: {
        mode?: "input" | "output";
        title?: string;
    }): Promise<Plot>;
    /** List files in a plot. Requires files:read scope. */
    listFiles(plotId: string): Promise<DriveFile[]>;
    /**
     * Upload a file to a plot via the Gather host.
     * Accepts a base64 data URL. Returns the file ID and thumbnail URL.
     */
    uploadFile(plotId: string, fileName: string, dataUrl: string): Promise<{
        fileId: string;
        thumbnailUrl: string;
    }>;
    /**
     * Proxy an image URL through the Gather host.
     * Returns a base64 data URL. Useful for loading Google Drive thumbnails
     * which are not accessible via direct cross-origin fetch.
     */
    proxyImageUrl(url: string): Promise<string>;
    /** List all plots the user has access to. Requires plots:read scope. */
    listPlots(): Promise<Plot[]>;
    /** Add a comment to a target in a plot. Requires comments:write scope. */
    addComment(plotId: string, options: AddCommentOptions): Promise<unknown>;
    /** Get a service proxy for making proxied calls to workspace services. */
    service(serviceName: string): ServiceProxy;
    private postToHost;
    private handleMessage;
    private proxyFetch;
}
