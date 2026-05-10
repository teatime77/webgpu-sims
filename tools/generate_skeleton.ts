// tools/generate_skeleton.ts
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url'; // ★ この行を追加

async function main() {
    const targetFile = process.argv[2];
    if (!targetFile) {
        console.error("Usage: npx tsx tools/generate_skeleton.ts <path/to/schema.ts>");
        process.exit(1);
    }

    const fullPath = path.resolve(targetFile);
    const dirName = path.dirname(fullPath);
    
    // ★ 修正: Windows対策として絶対パスを file:// URL に変換して読み込む
    const module = await import(pathToFileURL(fullPath).href);
    
    const schema = module.default || module.schema;
        
    if (!schema || !schema.nodes || !schema.resources) {
        console.error("Invalid schema format. Expected 'resources' and 'nodes'.");
        process.exit(1);
    }

    console.log(`Generating skeleton for: ${schema.name} (v${schema.version})`);

    // 各ノードごとに .wgsl ファイルを生成する
    for (const node of schema.nodes) {
        let code = `// ==========================================\n`;
        code += `// AUTO-GENERATED SKELETON FOR NODE: ${node.id}\n`;
        code += `// DO NOT MODIFY STRUCTS AND BINDINGS\n`;
        code += `// ==========================================\n\n`;

        // 1. 構造体 (Structs) の生成
        const generatedStructs = new Set<string>();
        for (const bind of node.bindings) {
            const res = schema.resources[bind.resource];
            if (res && res.type === 'uniform' && res.fields) {
                if (generatedStructs.has(bind.resource)) continue;
                generatedStructs.add(bind.resource);

                code += `struct ${bind.resource}Struct {\n`;
                for (const [fieldName, fieldType] of Object.entries(res.fields)) {
                    code += `    ${fieldName}: ${fieldType},\n`;
                }
                // ※パディングはエンジンが自動計算するためWGSL側にはダミーpadは書き出さなくてもOKですが、
                // WebGPUの厳密なアライメントに合わせてAIに書かせるための雛形になります。
                code += `};\n\n`;
            }
        }

        // 2. バインディング (Bindings) の生成
        for (const bind of node.bindings) {
            const res = schema.resources[bind.resource];
            if (!res) continue;

            const group = bind.group || 0;
            const bindingNum = bind.binding;
            const varName = bind.varName || bind.resource;

            if (res.type === 'uniform') {
                code += `@group(${group}) @binding(${bindingNum}) var<uniform> ${varName}: ${bind.resource}Struct;\n`;
            } 
            else if (res.type === 'storage') {
                // 🚨安全対策: Renderパスでは強制的に 'read' にする (WebGPUエラー回避)
                let access = bind.access || res.access || 'read';
                if (node.type === 'render') access = 'read';
                
                const isAtomic = res.format?.includes('atomic');
                if (isAtomic) access = 'read_write';

                code += `@group(${group}) @binding(${bindingNum}) var<storage, ${access}> ${varName}: array<${res.format}>;\n`;
            }
            else if (res.type === 'texture') {
                code += `@group(${group}) @binding(${bindingNum}) var ${varName}: texture_2d<f32>;\n`;
            }
            else if (res.type === 'sampler') {
                code += `@group(${group}) @binding(${bindingNum}) var ${varName}: sampler;\n`;
            }
        }

        code += `\n// ==========================================\n`;
        code += `// IMPLEMENT YOUR LOGIC BELOW\n`;
        code += `// ==========================================\n\n`;

        // 3. 関数本体のスケルトン生成
        if (node.type === 'compute') {
            let wgX: string | number = 64, wgY: string | number = 1, wgZ: string | number = 1;
            if (typeof node.workgroupSize === 'number' || typeof node.workgroupSize === 'string') {
                wgX = node.workgroupSize;
            } else if (Array.isArray(node.workgroupSize)) {
                wgX = node.workgroupSize[0] ?? 64;
                wgY = node.workgroupSize[1] ?? 1;
                wgZ = node.workgroupSize[2] ?? 1;
            }
            code += `@compute @workgroup_size(${wgX}, ${wgY}, ${wgZ})\n`;
            code += `fn main(@builtin(global_invocation_id) id: vec3<u32>) {\n`;
            code += `    let idx = id.x;\n`;
            code += `    // TODO: Write compute logic for ${node.id}\n`;
            code += `}\n`;
        } 
        else if (node.type === 'render') {
            code += `struct VertexOutput {\n`;
            code += `    @builtin(position) position: vec4<f32>,\n`;
            code += `    // @location(0) uv: vec2<f32>,\n`;
            code += `};\n\n`;
            code += `@vertex\n`;
            code += `fn vs_main(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOutput {\n`;
            code += `    var out: VertexOutput;\n`;
            code += `    // TODO: Write vertex logic\n`;
            code += `    return out;\n`;
            code += `}\n\n`;
            code += `@fragment\n`;
            code += `fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {\n`;
            code += `    // TODO: Write fragment logic\n`;
            code += `    return vec4<f32>(1.0, 0.0, 0.0, 1.0);\n`;
            code += `}\n`;
        }

        // ファイル書き出し (例: src/materials/cfd/step_velocity.wgsl)
        const outFileName = `${node.id}.wgsl`;
        const outFilePath = path.join(dirName, outFileName);
        fs.writeFileSync(outFilePath, code, 'utf-8');
        console.log(`  -> Created: ${outFileName}`);
    }

    console.log("Skeleton generation complete!");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});