// src/core/engine/WebGPUEngine.ts

export class WebGPUEngine {
    public device!: GPUDevice;
    public format!: GPUTextureFormat;
    
    // Map to manage multiple canvas contexts
    private contexts: Map<string, GPUCanvasContext> = new Map();

    private depthViews: Map<string, GPUTextureView> = new Map();

    /**
     * Initialize WebGPU. Call once when the application starts.
     */
    async init(): Promise<boolean> {
        if (!navigator.gpu) {
            console.error("WebGPU is not supported on this browser.");
            alert("This browser does not support WebGPU. Please use a supported browser like Chrome.");
            return false;
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.error("No appropriate GPUAdapter found.");
            return false;
        }

        // Request GPUDevice (this will be the parent of all resources)
        this.device = await adapter.requestDevice();
        // Get the optimal format for screen output (usually 'bgra8unorm' etc.)
        this.format = navigator.gpu.getPreferredCanvasFormat();

        console.log("WebGPU Engine Initialized Successfully.");
        return true;
    }

    /**
     * Register the canvas with the engine and set it up for drawing with WebGPU.
     * @param canvasId The ID of the canvas element in HTML
     */
    addCanvas(canvasId: string): GPUCanvasContext | null {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            console.error(`Canvas ID '${canvasId}' not found.`);
            return null;
        }

        const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
        if (!context) {
            console.error("Failed to get WebGPU context.");
            return null;
        }

        context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        this.contexts.set(canvasId, context);

        // Create and save a depth texture of the same size as the canvas
        const depthTexture = this.device.createTexture({
            size: [canvas.width, canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthViews.set(canvasId, depthTexture.createView());

        return context;
    }

    /**
     * Get a registered context. Used when executing a render pass.
     */
    getContext(canvasId: string): GPUCanvasContext {
        const context = this.contexts.get(canvasId);
        if (!context) {
            throw new Error(`Canvas '${canvasId}' is not registered.`);
        }
        return context;
    }

    // Method to get the depth view
    getDepthView(canvasId: string): GPUTextureView {
        const view = this.depthViews.get(canvasId);
        if (!view) {
            throw new Error(`The depth view for canvas '${canvasId}' is not registered.`);
        }
        return view;
    }

    /**
     * Get all registered canvas elements and their IDs (for capture)
     */
    getCanvases(): { id: string, canvas: HTMLCanvasElement }[] {
        const result: { id: string, canvas: HTMLCanvasElement }[] = [];
        for (const [id, context] of this.contexts.entries()) {
            result.push({ id, canvas: context.canvas as HTMLCanvasElement });
        }
        return result;
    }
}