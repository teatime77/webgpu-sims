// src/CaptureTool.ts

import type { SimulationRunner } from "./SimulationRunner.js";
import { $, $btn, $inp } from "./utils.js";

export class CaptureTool {
    private isCapturing = false;

    constructor(engine: SimulationRunner) {
        this.setupCapturePanel(engine);
    }

    private async captureCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error("Failed to capture canvas image."));
                    return;
                }
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(url);
                resolve();
            }, "image/png");
        });
    }

    private setupCapturePanel(engine: SimulationRunner): void {
        const panel = $("capture-panel");
        const captureBtn = $btn("capture-btn");
        const burstBtn = $btn("burst-btn");
        const countInput = $inp("capture-count");
        const intervalInput = $inp("capture-interval");

        const setBusy = (busy: boolean) => {
            this.isCapturing = busy;
            captureBtn.disabled = busy;
            burstBtn.disabled = busy;
            panel.style.opacity = busy ? "0.5" : "1.0";
        };

        // Single capture
        captureBtn.addEventListener("click", async () => {
            if (this.isCapturing) return;
            setBusy(true);
            try {
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                const stamp = Date.now();
                const canvases = engine.getCanvases();
                
                for (const { id, canvas } of canvases) {
                    const filename = canvases.length > 1 
                        ? `capture_${id}_${stamp}.png` 
                        : `capture_${stamp}.png`;
                    await this.captureCanvasPng(canvas, filename);
                }
            } finally {
                setBusy(false);
            }
        });

        // Burst capture (continuous shooting)
        burstBtn.addEventListener("click", async () => {
            if (this.isCapturing) return;
            const count = Math.max(1, Math.min(200, Number(countInput.value) || 1));
            const intervalMs = Math.max(10, Math.min(5000, Number(intervalInput.value) || 100));
            setBusy(true);
            
            try {
                const base = Date.now();
                const canvases = engine.getCanvases();

                for (let i = 0; i < count; i++) {
                    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                    const frameStr = String(i).padStart(3, "0");
                    
                    for (const { id, canvas } of canvases) {
                        const filename = canvases.length > 1 
                            ? `capture_${id}_${base}_${frameStr}.png` 
                            : `capture_${base}_${frameStr}.png`;
                        await this.captureCanvasPng(canvas, filename);
                    }
                    
                    if (i < count - 1) {
                        await new Promise(res => setTimeout(res, intervalMs));
                    }
                }
            } finally {
                setBusy(false);
            }
        });
    }
}