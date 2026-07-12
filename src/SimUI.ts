import { ReadBackDef } from "./resource.js";
import { SimulationSchema, theSchema } from "./schema.js";
import type { SimulationRunner } from "./SimulationRunner.js";
import { Const } from "./syntax.js";
import { $btn, $div, copyToClipboard, logForAgent, msg, MyError } from "./utils.js";

export interface UIDef {
    type : "range" | "select" | "label",
    obj:Const,
    name:string,
    label: string, 
}

export interface RangeDef extends UIDef {
    min: number, 
    max: number, 
    step: number, 
    initial?: number,
    slider : HTMLInputElement
}

export interface SelectDef extends UIDef {
    options: {value: number, text: string}[], 
    initial?: number,
    reset? : boolean
}

export interface LabelDef extends UIDef {
    resourceId : string;
    resource : ReadBackDef;
    valueSpan : HTMLSpanElement;
    decimalPlaces: number;
}

export class SimUI {
    private container: HTMLDivElement;

    constructor() {
        this.container = $div('sim-ui-container');
        const children = Array.from(this.container.children);
        children.filter(x => x != $btn("copy-uis-btn")).forEach(x => x.remove());
        // this.container.innerHTML = "";
    }

    /**
     * Method equivalent to ui.range in V1
     */
    addRange(data : RangeDef, onChange: (val: number) => void) {
        const initial = data.initial ?? data.obj.value[data.name];

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '4px 0';

        const lbl = document.createElement('label');
        lbl.textContent = data.label;
        lbl.style.minWidth = '80px';
        lbl.style.fontSize = '13px';

        data.slider = document.createElement('input');
        data.slider.type = 'range';
        data.slider.min = data.min.toString();
        data.slider.max = data.max.toString();
        data.slider.step = data.step.toString();
        data.slider.value = initial.toString();
        data.slider.style.flex = '1';

        const valDisp = document.createElement('span');
        // Calculate the number of decimal places to display from the step size (equivalent to decimalsFromStep in V1)
        const dec = Math.max(0, -Math.floor(Math.log10(data.step)));
        valDisp.textContent = initial.toFixed(dec);
        valDisp.style.minWidth = '40px';
        valDisp.style.textAlign = 'right';
        valDisp.style.fontFamily = 'monospace';
        valDisp.style.fontSize = '12px';

        // Trigger callback the moment the slider is moved (equivalent to live: true)
        data.slider.addEventListener('input', () => {
            const val = parseFloat(data.slider.value);
            valDisp.textContent = val.toFixed(dec);
            onChange(val); // Pass the value outside
        });

        row.appendChild(lbl);
        lbl.appendChild(data.slider);
        row.appendChild(valDisp);
        this.container.appendChild(row);
    }

    addLabel(data:LabelDef) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '4px 0';

        const lbl = document.createElement('span');
        lbl.textContent = data.label;
        lbl.style.minWidth = '80px';
        lbl.style.fontSize = '13px';

        data.valueSpan = document.createElement('span');
        data.valueSpan.textContent = "";
        data.valueSpan.style.minWidth = '40px';
        data.valueSpan.style.textAlign = 'right';
        data.valueSpan.style.fontFamily = 'monospace';
        data.valueSpan.style.fontSize = '12px';

        row.appendChild(lbl);
        row.appendChild(data.valueSpan);
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
            data.obj.value[data.name] = val;
        }

        this.addRange(data, onChange);
    }

    makeSelect(runner:SimulationRunner, data : SelectDef){
        async function onChange(val: number) : Promise<void> {
            data.obj.value[data.name] = val;

            if(data.reset !== false){
                runner.initScript();
            }
        }

        const initial = data.initial ?? data.obj.value[data.name];
        this.addSelect(data.label, data.options, initial, onChange);
    }

    makeLabel(schema: SimulationSchema, data : LabelDef){
        this.addLabel(data);

        const readback = schema.resources.get(data.resourceId);
        if(!(readback instanceof ReadBackDef)){
            throw new MyError(`resource id[${data.resourceId}] of label[${data.name}] is illegal.`);
        }

        readback.labels.set(data.name, data);
    }
}

export function makeUIs(runner:SimulationRunner, schema: SimulationSchema){
    const simUI = new SimUI();

    const uis:UIDef[] = schema.uis!;

    for(const ui of uis){
        switch(ui.type){
        case "range":
            simUI.makeRange(ui as RangeDef);
            break;

        case "select":
            simUI.makeSelect(runner, ui as SelectDef);
            break;

        case "label":
            simUI.makeLabel(schema, ui as LabelDef);
            break;

        default:
            throw new MyError(`type[${ui.type}] of UI[${ui.name}] is unknown.`);
        }
    }
}

export async function copyUiValues(){
    if(theSchema.uis == undefined){
        return;
    }

    let data : any[] = []
    for(const ui of theSchema.uis){
        let valueStr : string;

        switch(ui.type){
        case "range":
            valueStr = (ui as RangeDef).slider.value;
            break;
        case "label":
            valueStr = (ui as LabelDef).valueSpan.textContent;
            break;
        default:
            throw new MyError(`type[${ui.type}] of UI[${ui.name}] is unknown.`);
        }

        data.push({
            type: ui.type,
            name : ui.name,
            label : ui.label,
            value : parseFloat(valueStr)
        });
    }

    const json = JSON.stringify(data, null, 4);
    msg(`UI:${json}`);
    await copyToClipboard(json);

    logForAgent("UI values are copied.");
}