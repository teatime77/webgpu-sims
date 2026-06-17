import { makeArrowMesh, makeCylinderMesh, makeGeodesicPolyhedron, makeTube } from './primitive.js';
import { assert, MyError } from './utils.js';
import { FunctionExpression, StructDeclaration } from './parser.js';
import { MeshDef, MeshShape, ReadBackDef, ResourceDef, StorageDef, UniformDef } from './resource.js';
import { ComputePassBuilder, NodeDef, RenderPassBuilder } from './pipeline.js';
import { UIDef } from './SimUI.js';
import { CanvasDef } from './SimulationRunner.js';

export let theSchema : SimulationSchema;

function getShapeStride(shape: MeshShape) : number {
    switch(shape){
    case "sphere": 
        return 8;
    case "tube"  :
    case "cylinder":
    case "arrow" :
        return 12;
    default:       throw new MyError();
    }
}

export interface ISimulationSchema {
    name?: string;
    structs? : StructDeclaration[];
    resources: Record<string, ResourceDef>;
    shaders: NodeDef[];
    uis? : UIDef[];
    canvases?: CanvasDef[];
    script?: FunctionExpression;
}

export class SimulationSchema {
    name?: string;
    structs? : StructDeclaration[];
    resources: Map<string, ResourceDef>;
    shaders: NodeDef[];
    nodeMap : Map<string, NodeDef>;
    uis? : UIDef[];
    canvases?: CanvasDef[];
    script?: FunctionExpression;
    isReady : boolean = false;

    constructor(device: GPUDevice, data: ISimulationSchema){
        theSchema = this;

        this.name = data.name;
        this.structs = data.structs;
        if(this.structs != undefined){
            this.structs.forEach(x => x.setStructSize());
        }

        this.resources = new Map<string, ResourceDef>();
        for(const [id, val] of Object.entries(data.resources)){
            // let def: ResourceDef;
            if(val.type == "mesh"){
                const def = new MeshDef(id, val as any);

                switch(def.shape){
                case "sphere":
                    def.data = makeGeodesicPolyhedron(def.division);
                    break;
                case "tube":
                    def.data = makeTube(def.division);
                    break;
                case "cylinder":
                    def.data = makeCylinderMesh(def.division);
                    break;
                case "arrow":
                    def.data = makeArrowMesh({});
                    break;
                default:
                    throw new Error();
                }

                this.resources.set(id, def);
            }
            else if(val.type == "storage"){
                const def = new StorageDef(id, val as any);
                this.resources.set(id, def);
            }
            else if(val.type == "readback"){
                const def = new ReadBackDef(id, val as any);
                this.resources.set(id, def);
            }
            else if(val.type == "uniform"){
                const def = new UniformDef(id, val as any);
                this.resources.set(id, def);
            }
            else{
                throw new MyError();
            }
        }

        if(! this.resources.has("Camera")){
            const fields = [
                { name: "viewProjection", format: 'mat4x4<f32>' },
                { name: "view", format: 'mat4x4<f32>' }
            ];
            const Camera = { type: 'uniform', fields };
            const def = new UniformDef("Camera", Camera);
            this.resources.set("Camera", def);
            // msg("make camera");
        }

        this.shaders = data.shaders.map(x => {
            if(x.type == "compute"){
                return new ComputePassBuilder(x);
            }
            else if(x.type == "render"){
                return new RenderPassBuilder(x);
            }
            else{
                throw new MyError();
            }
        });

        const shapeReses = Array.from(this.resources.values()).filter(x => x instanceof StorageDef && x.meshRef != undefined) as StorageDef[];
        for(const res of shapeReses){
            const mesh = this.resources.get(res.meshRef!)! as MeshDef;
            assert(mesh instanceof MeshDef);

            const stride = getShapeStride(mesh.shape);

            const renderDef = {
                id: `${res.id}_render`,
                type: 'render',
                vertexCount: mesh.data.length / (3 + 3),    // position + norm
                instanceCount: res.count! / stride,
                canvasId : res.canvasId,
                bindings: [
                    { resource: 'Camera' },
                    { resource: res.id, varName: 'instances' },
                    { resource: mesh.id, varName: 'vertexData' }
                ]
            }

            const render = new RenderPassBuilder(renderDef);
            this.shaders.push(render);
        }

        const topologyReses = Array.from(this.resources.values()).filter(x => x instanceof StorageDef && x.topology != undefined) as StorageDef[];
        for(const res of topologyReses){
            if(res.count == undefined){
                throw new MyError();
            }

            let vertexCount = 1;
            let instanceCount = res.count || 1;

            switch(res.topology){
            case 'point-list':
                vertexCount = 1;               // 1 vertex per dot
                instanceCount = res.count! / 8; // 8 floats per point stride (POINT_STRIDE)
                break;
            case 'line-list':
                vertexCount = 2;                // 2 vertices per line segment
                instanceCount = res.count! / 12; // 12 floats per line stride (LINE_STRIDE)
                break;
            case 'triangle-list':{
                let numTriangles : number;

                switch(res.shadingModel){
                case "triangle-color":
                    numTriangles = res.count! / 13; // Count how many 13-float blocks exist
                    vertexCount = numTriangles * 3;       // WebGPU needs to invoke the vertex shader 3 times per triangle
                    instanceCount = 1;
                    break;
                case "vertex-color":
                    vertexCount = res.count! / 7;  // 7 floats per vertex
                    instanceCount = 1;             // Drawn as one large buffer
                    break;
                case "vertex-color-normal":
                    vertexCount = res.count! / 10; // 10 floats per vertex
                    instanceCount = 1;
                    break;

                default:
                    throw new MyError();
                }
                break;
            }

            default:
                throw new MyError();
            }

            const renderDef = {
                id: `${res.id}_render`,
                type: 'render',
                topology: res.topology,
                shadingModel : res.shadingModel,
                vertexCount: vertexCount,
                instanceCount: instanceCount, // 🌟 Now properly passed to passEncoder.draw()
                canvasId : res.canvasId,
                bindings: [
                    { resource: 'Camera' },
                    { resource: res.id, varName: 'instances' },
                ]
            };

            const render = new RenderPassBuilder(renderDef);
            this.shaders.push(render);
        }

        this.shaders.forEach(node => node.bindings.forEach(b => {
            b.resourceDef = this.resources.get(b.resource);
            assert(b.resourceDef != undefined);            
        }));

        this.nodeMap = new Map<string, NodeDef>(this.shaders.map(x => [x.id, x]));

        this.uis   = data.uis;
        this.canvases = data.canvases;
        this.script = data.script;
        if(data.script != undefined){
            assert(data.script instanceof FunctionExpression);
        }
    }

    computeNodes() : NodeDef[] {
        return Array.from(this.nodeMap.values()).filter(x => x.type == "compute");
    }

    getNode(id:string) : NodeDef {
        const node = this.shaders.find(x => x.id == id)!;
        assert(node != undefined);

        return node;
    }

    getUniform(id:string) : UniformDef | undefined {
        const res = this.resources.get(id);
        if(res instanceof UniformDef){
            return res;
        }
        else{
            return undefined;
        }
    }

    getComputeShaders() : ComputePassBuilder[] {
        return Array.from(this.shaders).filter(x => x instanceof ComputePassBuilder) as ComputePassBuilder[];
    }
}
