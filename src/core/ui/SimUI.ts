// import { run } from "node:test";
import type { RangeDef, SelectDef, SimulationRunner, SimulationSchema, UIDef } from "../engine/SimulationRunner";

// src/core/ui/SimUI.ts

export class SimUI {
    private container: HTMLElement;
    private hud: HTMLElement;

    constructor() {
        // HMR(ホットリロード)時にUIが重複して増えないように古いものを削除
        const existing = document.getElementById('sim-ui-container');
        if (existing) existing.remove();

        // V1のデザインを踏襲したフローティングコンテナ
        this.container = document.createElement('div');
        this.container.id = 'sim-ui-container';
        this.container.style.position = 'absolute'; // fixedからabsoluteに変更(キャンバス基準)
        this.container.style.top = '10px';
        this.container.style.right = '10px';
        this.container.style.background = 'rgba(20, 20, 25, 0.85)';
        this.container.style.color = 'white';
        this.container.style.padding = '12px';
        this.container.style.borderRadius = '8px';
        this.container.style.fontFamily = 'sans-serif';
        this.container.style.border = '1px solid #444';
        this.container.style.zIndex = '1000';
        document.body.appendChild(this.container);

        // ★HUD用の要素を作成
        this.hud = document.createElement('div');
        this.hud.style.padding = '8px';
        this.hud.style.marginBottom = '8px';
        this.hud.style.borderBottom = '1px solid #444';
        this.hud.style.color = '#0af'; // 少し目立つ色
        this.hud.style.fontSize = '14px';
        this.hud.style.fontWeight = 'bold';
        this.hud.style.fontFamily = 'monospace';
        this.container.prepend(this.hud);
    }

    // ★HUDのテキストを更新するメソッド
    updateHUD(text: string) {
        this.hud.textContent = text;
    }

    /**
     * V1の ui.range に相当するメソッド
     */
    addRange(label: string, min: number, max: number, step: number, initial: number, onChange: (val: number) => void) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '4px 0';

        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.minWidth = '80px';
        lbl.style.fontSize = '13px';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min.toString();
        slider.max = max.toString();
        slider.step = step.toString();
        slider.value = initial.toString();
        slider.style.flex = '1';

        const valDisp = document.createElement('span');
        // ステップ数から小数点以下の表示桁数を計算 (V1の decimalsFromStep 相当)
        const dec = Math.max(0, -Math.floor(Math.log10(step)));
        valDisp.textContent = initial.toFixed(dec);
        valDisp.style.minWidth = '40px';
        valDisp.style.textAlign = 'right';
        valDisp.style.fontFamily = 'monospace';
        valDisp.style.fontSize = '12px';

        // スライダーを動かした瞬間にコールバックを発火 (live: true に相当)
        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            valDisp.textContent = val.toFixed(dec);
            onChange(val); // 外部に値を渡す
        });

        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(valDisp);
        this.container.appendChild(row);
    }

    /**
     * ドロップダウンリスト（Select）を追加します
     */
    addSelect(label: string, options: {value: number, text: string}[], initial: number, onChange: (val: number) => Promise<void>) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '4px 0';

        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.minWidth = '80px';
        lbl.style.fontSize = '13px';

        const select = document.createElement('select');
        select.style.flex = '1';
        select.style.background = '#333';
        select.style.color = '#fff';
        select.style.border = '1px solid #555';
        select.style.padding = '4px';
        select.style.borderRadius = '4px';
        
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value.toString();
            o.textContent = opt.text;
            select.appendChild(o);
        });
        
        select.value = initial.toString();
        
        select.addEventListener('change', async () => {
            await onChange(Number(select.value));
        });

        row.appendChild(lbl);
        row.appendChild(select);
        this.container.appendChild(row);
    }

    makeRange(data : RangeDef){
        function onChange(val: number) :void {
            data.obj[data.name] = val;
        }

        const initial = data.initial ?? data.obj[data.name];
        this.addRange(data.label, data.min, data.max, data.step, initial, onChange);
    }

    makeSelect(runner:SimulationRunner, schema: SimulationSchema, data : SelectDef){
        async function onChange(val: number) : Promise<void> {
            data.obj[data.name] = val;

            if(data.reset == true){
                runner.generator = schema.script(runner);
            }
        }

        const initial = data.initial ?? data.obj[data.name];
        this.addSelect(data.label, data.options, initial, onChange);
    }
}

export function makeUIs(runner:SimulationRunner, schema: SimulationSchema){
    const simUI = new SimUI();

    const uis:UIDef[] = schema.uis!;

    for(const ui of uis){
        switch(ui.type){
        case "range":
            simUI.makeRange(ui);
            break;

        case "select":
            simUI.makeSelect(runner, schema, ui);
            break;

        default:
            throw new Error();
        }
    }
}
