import { theRunner } from "./SimulationRunner.js";
import { $, $btn, $inp, logForAgent, msg, MyError } from "./utils.js";

export class CaptureTool {
    private captureBtn : HTMLButtonElement;
    private burstBtn : HTMLButtonElement;
    private isCapturing = false;

    constructor() {
        this.captureBtn = $btn("capture-btn");
        this.burstBtn = $btn("burst-btn");

        this.captureBtn.addEventListener("click", this.onCaptureBtn.bind(this));
        this.burstBtn.addEventListener("click", this.onBurstBtn.bind(this));
    }

    setBusy(busy: boolean){
        const panel = $("capture-panel");

        this.isCapturing = busy;
        this.captureBtn.disabled = busy;
        this.burstBtn.disabled = busy;
        panel.style.opacity = busy ? "0.5" : "1.0";
    }

    private async captureCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new MyError("Failed to capture canvas image."));
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

    async onCaptureBtn(){
        if (this.isCapturing) return;
        this.setBusy(true);
        try {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const stamp = Date.now();
            const canvases = theRunner.getCanvases();
            
            for (const { id, canvas } of canvases) {
                const filename = canvases.length > 1 
                    ? `capture_${id}_${stamp}.png` 
                    : `capture_${stamp}.png`;
                await this.captureCanvasPng(canvas, filename);
                logForAgent(`capture:${filename}`)
            }
        } finally {
            this.setBusy(false);
        }
    }

    async onBurstBtn(){
        if (this.isCapturing) return;
        
        const countInput = $inp("capture-count");
        const intervalInput = $inp("capture-interval");
        const count = Math.max(1, Math.min(200, Number(countInput.value) || 1));
        const intervalMs = Math.max(10, Math.min(5000, Number(intervalInput.value) || 100));
        this.setBusy(true);
        
        try {
            const base = Date.now();
            const canvases = theRunner.getCanvases();

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
            this.setBusy(false);
        }
    }
}