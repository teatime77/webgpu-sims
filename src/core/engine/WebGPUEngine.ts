// src/core/engine/WebGPUEngine.ts

export class WebGPUEngine {
    public device!: GPUDevice;
    public format!: GPUTextureFormat;
    
    // 複数のキャンバスコンテキストを管理するMap
    private contexts: Map<string, GPUCanvasContext> = new Map();

    private depthViews: Map<string, GPUTextureView> = new Map();

    /**
     * WebGPUの初期化。アプリケーション起動時に1度だけ呼び出します。
     */
    async init(): Promise<boolean> {
        if (!navigator.gpu) {
            console.error("WebGPU is not supported on this browser.");
            alert("このブラウザはWebGPUをサポートしていません。Chromeなどの対応ブラウザを使用してください。");
            return false;
        }

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.error("No appropriate GPUAdapter found.");
            return false;
        }

        // GPUDeviceを取得（これがすべてのリソースの親になります）
        this.device = await adapter.requestDevice();
        // 画面出力に最適なフォーマット（通常は 'bgra8unorm' など）を取得
        this.format = navigator.gpu.getPreferredCanvasFormat();

        console.log("WebGPU Engine Initialized Successfully.");
        return true;
    }

    /**
     * キャンバスをエンジンに登録し、WebGPUで描画できるように設定します。
     * @param canvasId HTML上のcanvas要素のID
     */
    addCanvas(canvasId: string): GPUCanvasContext | null {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) {
            console.error(`Canvas ID '${canvasId}' が見つかりません。`);
            return null;
        }

        const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
        if (!context) {
            console.error("WebGPU context の取得に失敗しました。");
            return null;
        }

        context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied',
        });

        this.contexts.set(canvasId, context);

        // キャンバスと同じサイズのデプステクスチャを作成して保存する
        const depthTexture = this.device.createTexture({
            size: [canvas.width, canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthViews.set(canvasId, depthTexture.createView());

        return context;
    }

    /**
     * 登録済みのコンテキストを取得します。描画パスを実行する際に使用します。
     */
    getContext(canvasId: string): GPUCanvasContext {
        const context = this.contexts.get(canvasId);
        if (!context) {
            throw new Error(`Canvas '${canvasId}' は登録されていません。`);
        }
        return context;
    }

    // デプスビューを取得するためのメソッド
    getDepthView(canvasId: string): GPUTextureView {
        const view = this.depthViews.get(canvasId);
        if (!view) {
            throw new Error(`Canvas '${canvasId}' のデプスビューは登録されていません。`);
        }
        return view;
    }
}