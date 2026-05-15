// src/core/CaptureTool.ts

import type { SimulationRunner } from "./SimulationRunner";
import { MyError } from "./utils";

export function assert(ok : boolean){
    if(!ok){
        throw new MyError();
    }
}

export async function fetchText(fileURL: string) {
    const response = await fetch(fileURL);
    const text = await response!.text();

    return text;
}

export class CaptureTool {
    private isCapturing = false;

    constructor(engine: SimulationRunner, prefix: string = "sim") {
        this.setupCapturePanel(engine, prefix);
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

    private setupCapturePanel(engine: SimulationRunner, prefix: string): void {
        if (document.getElementById("capture-panel")) return;

        const panel = document.createElement("div");
        panel.id = "capture-panel";
        panel.style.position = "absolute";
        panel.style.left = "10px";
        panel.style.bottom = "10px";
        panel.style.padding = "8px";
        panel.style.borderRadius = "8px";
        panel.style.background = "rgba(20, 20, 25, 0.85)";
        panel.style.color = "white";
        panel.style.fontFamily = "sans-serif";
        panel.style.border = "1px solid #444";
        panel.style.display = "flex";
        panel.style.gap = "8px";
        panel.style.alignItems = "center";
        panel.style.zIndex = "1000";

        const captureBtn = document.createElement("button");
        captureBtn.textContent = "Capture";
        captureBtn.style.fontSize = "14px";
        captureBtn.style.cursor = "pointer";

        const burstBtn = document.createElement("button");
        burstBtn.textContent = "Burst xN";
        burstBtn.style.fontSize = "14px";
        burstBtn.style.cursor = "pointer";

        const countInput = document.createElement("input");
        countInput.type = "number";
        countInput.min = "1"; countInput.max = "200"; countInput.step = "1";
        countInput.value = "10";
        countInput.style.width = "50px";

        const intervalInput = document.createElement("input");
        intervalInput.type = "number";
        intervalInput.min = "10"; intervalInput.max = "5000"; intervalInput.step = "10";
        intervalInput.value = "100";
        intervalInput.style.width = "60px";

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
                        ? `${prefix}_${id}_${stamp}.png` 
                        : `${prefix}_${stamp}.png`;
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
                            ? `${prefix}_${id}_${base}_${frameStr}.png` 
                            : `${prefix}_${base}_${frameStr}.png`;
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

        panel.append(captureBtn, burstBtn, countInput, " N ", intervalInput, " ms");
        document.body.appendChild(panel);
    }
}