import { mapAsyncBuffer, StructDeclaration } from "./parser.js";
import { ShadingModel } from "./pipeline.js";
import { theSchema } from "./schema.js";
import { LabelDef } from "./SimUI.js";
import { theDevice } from "./SimulationRunner.js";
import { assert, MyError } from "./utils.js";

export type WgslFormat = 'f32' | 'u32' | 'i32' | 'vec2<f32>' | 'vec3<f32>' | 'vec4<f32>' | 'mat4x4<f32>';
export type MeshShape = "sphere" | "tube" | "cylinder" | "arrow";

function getElementSizeAlignment(format : string) : [number, number] {
    let alignment;
    let size;

    switch(format){
    case 'f32':
    case 'u32':
    case 'i32':
        size = 4; alignment = 4; 
        break;
    case 'vec2<f32>': 
        size = 8; alignment = 8; 
        break;
    case 'vec3<f32>': 
    case 'vec4<f32>': 
        size = 16; alignment = 16; 
        break;
    case 'mat4x4<f32>': 
        size = 64; alignment = 16; 
        break;
    default:{
        if(theSchema.structs != undefined){
            const st = theSchema.structs.find(x => x.name == format);
            if(st != undefined){
                size = st.size;
                alignment = 16; 
                break;
            }
        }

        throw new MyError();
    }

    }

    return [size, alignment];
}

function getElementSize(format : string) : number {
    const [size, _] = getElementSizeAlignment(format);
    return size;
}

export abstract class ResourceDef {
    type!: 'uniform' | 'storage' | 'mesh' | 'readback';

    public id: string;
    public buffers!: GPUBuffer[];
    public bufferCount!: number;
    public currentIndex: number = 0;

    constructor(id: string){
        this.id = id;
    }

    abstract makebufferss(device: GPUDevice, id: string) : void;

    /** historyLevel: 0 is the current write surface, 1 is the data from 1 step ago */
    getBuffer(historyLevel: number = 0): GPUBuffer {
        const n = this.bufferCount;
        const idx = (this.currentIndex + n - historyLevel) % n;
        return this.buffers[idx];
    }

    /** Rotate the ring at the end of the frame/step */
    swap(): void {
        this.currentIndex = (this.currentIndex + 1) % this.bufferCount;
    }

    destroyBuffers(){
        if(this.buffers != undefined){
            this.buffers.filter(x => x != mapAsyncBuffer).forEach(x => x.destroy());
        }
    }
}

export class StorageDef extends ResourceDef {
    format?: WgslFormat;                 // for storage (e.g. vec4<f32>)
    elementByteSize?: number;            // for storage (custom structs: e.g. 32 bytes)
    count?: number;                      // for storage
    meshRef? : string;
    topology?: GPUPrimitiveTopology;
    shadingModel? : ShadingModel;
    canvasId?: string;

    constructor(id: string, data : any){
        super(id);
        Object.assign(this, data)
    }

    makebufferss(device: GPUDevice, id: string) : void {
        const count = this.bufferCount || 1;
        const buffers: GPUBuffer[] = [];
        
        // Calculate byte size of a single element from WGSL format
        if(this.format == undefined){
            throw new MyError();
        }
        const elementSize = getElementSize(this.format);
        
        const byteSize = elementSize * (this.count || 1);

        for (let i = 0; i < count; i++) {
            buffers.push(device.createBuffer({
                label: `Storage_${id}_${i}`,
                size: byteSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX
            }));
        }

        this.buffers = buffers;
        this.bufferCount = count;
    }
}


export interface FieldDef {
    name  : string;
    offset: number;
    format: WgslFormat;
    size  : number;
}

export function FieldDefToStr(fld : FieldDef){
    return `    ${fld.name} : ${fld.format};\n`;
}

export function makeFieldDefs(fields:FieldDef[]) : number {
    const fieldDefs: FieldDef[] = [];

    let offset = 0;
    for (const field of fields) {
        const [size, alignment] = getElementSizeAlignment(field.format);

        field.size = size;
        field.offset = Math.ceil(offset / alignment) * alignment;

        offset += size;
    }

    return offset;
}

export class UniformDef extends ResourceDef {
    fields: FieldDef[] = [];
    totalSize: number;
    buffer!: GPUBuffer;
    obj? : any;

    constructor(id: string, data : any){
        super(id);
        Object.assign(this, data);

        if(this.obj == undefined){
            assert(this.fields.length != 0);
        }
        else{

            for (const [name, val] of Object.entries(this.obj)){
                assert(typeof val == "number");
                this.fields.push({ name, format: 'f32' } as FieldDef);
            }
        }

        let offset = makeFieldDefs(this.fields);

        // Round up total size to 16 byte boundary as well
        this.totalSize = Math.ceil(offset / 16) * 16;
    }

    makebufferss(device: GPUDevice, id: string) : void {
        this.buffer = device.createBuffer({
            label: `Uniform_${this.id}`,
            size: this.totalSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
    }

    /** Equivalent to updateVariables in V1: construct binary from JS object and transfer at once */
    update(obj : any) {
        const arrayBuffer = new ArrayBuffer(this.totalSize);
        const view = new DataView(arrayBuffer);

        for(const [name, val] of Object.entries(obj)) {
            const info = this.fields.find(x => x.name == name)!;
            assert(info != undefined);

            if(['f32', 'u32', 'i32'].includes(info.format)){
                assert(typeof val == "number");
            }
            
            if (info.format === 'f32') {
                view.setFloat32(info.offset, val as number, true); // true = little endian
            } else if (info.format === 'u32') {
                view.setUint32(info.offset, val as number, true);
            } else if (info.format === 'i32') {
                view.setInt32(info.offset, val as number, true);
            } else if (Array.isArray(val) || val instanceof Float32Array) {
                assert(Array.isArray(val) && val.every(x => typeof x == "number"));
                // Array writing for vec2, vec3, vec4, mat4x4 etc.
                for (let i = 0; i < val.length; i++) {
                    view.setFloat32(info.offset + i * 4, val[i], true);
                }
            }
        }

        theDevice.queue.writeBuffer(this.buffer, 0, arrayBuffer);
    }
}

abstract class MeshReadBackDef extends ResourceDef {
    data!: Float32Array;

    abstract getUsage() : number;

    makebufferss(device: GPUDevice, id: string) : void {
        const buffer = device.createBuffer({
            label: `Storage_${id}`,
            size: this.data.byteLength,
            usage: this.getUsage()
        });

        this.buffers = [buffer];
        this.bufferCount = 1;
    }
}

export class MeshDef extends MeshReadBackDef {
    shape!: MeshShape;
    division?: number;

    constructor(id: string, data : any){
        super(id);
        Object.assign(this, data)
        assert(this.type == 'mesh');
    }

    getUsage() : number {
        return GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.VERTEX;
    }
}

export class ReadBackDef extends MeshReadBackDef {
    structDef : StructDeclaration;
    labels = new Map<string, LabelDef>();

    constructor(id: string, data : any){
        super(id);
        Object.assign(this, data);
        const format = data.format;
        assert(theSchema.structs != undefined && typeof format == "string");
        this.structDef = theSchema.structs!.find(x => x.name == format)!;
        assert(this.structDef != undefined);

        const cnt = this.structDef.size / 4;
        this.data = new Float32Array(cnt);
    }

    getUsage() : number {
        return GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ;
    }

    setLabelValues(){
        for(const label of this.labels.values()){
            const field = this.structDef.fields.find(x => x.name == label.name)!;
            assert(field != undefined);

            const idx = field.offset / 4;

            label.valueSpan.textContent = this.data[idx].toFixed(label.decimalPlaces);
        }
    }
}
