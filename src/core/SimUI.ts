import type { RangeDef, SelectDef, SimulationRunner, SimulationSchema, UIDef } from "./SimulationRunner";

// src/core/SimUI.ts

export class SimUI {
    private container: HTMLElement;
    private hud: HTMLElement;

    constructor() {
        // Remove old UI to prevent duplicates during HMR (Hot Module Replacement)
        const existing = document.getElementById('sim-ui-container');
        if (existing) existing.remove();

        // Floating container following V1 design
        this.container = document.createElement('div');
        this.container.id = 'sim-ui-container';
        this.container.style.position = 'absolute'; // Changed from fixed to absolute (relative to canvas)
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

        // ★ Create elements for HUD
        this.hud = document.createElement('div');
        this.hud.style.padding = '8px';
        this.hud.style.marginBottom = '8px';
        this.hud.style.borderBottom = '1px solid #444';
        this.hud.style.color = '#0af'; // Slightly standout color
        this.hud.style.fontSize = '14px';
        this.hud.style.fontWeight = 'bold';
        this.hud.style.fontFamily = 'monospace';
        this.container.prepend(this.hud);
    }

    // ★ Method to update HUD text
    updateHUD(text: string) {
        this.hud.textContent = text;
    }

    /**
     * Method equivalent to ui.range in V1
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
        // Calculate the number of decimal places to display from the step size (equivalent to decimalsFromStep in V1)
        const dec = Math.max(0, -Math.floor(Math.log10(step)));
        valDisp.textContent = initial.toFixed(dec);
        valDisp.style.minWidth = '40px';
        valDisp.style.textAlign = 'right';
        valDisp.style.fontFamily = 'monospace';
        valDisp.style.fontSize = '12px';

        // Trigger callback the moment the slider is moved (equivalent to live: true)
        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            valDisp.textContent = val.toFixed(dec);
            onChange(val); // Pass the value outside
        });

        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(valDisp);
        this.container.appendChild(row);
    }

    /**
     * Adds a dropdown list (Select)
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
                runner.initScript();
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
