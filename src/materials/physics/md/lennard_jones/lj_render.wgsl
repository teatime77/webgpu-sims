// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: lj_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    dt: f32,
    epsilon: f32,
    sigma: f32,
    boxSize: f32,
    damping: f32,
    pad1: f32,
    pad2: f32,
    pad3: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> baseMesh: array<f32>;
@group(0) @binding(3) var<uniform> params: ParamsStruct;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOutput {
    var out: VertexOutput;

    // 1. Read base unit sphere geometry (6 floats per vertex)
    let v_offset = v_idx * 6u;
    let v_pos = vec3<f32>(baseMesh[v_offset], baseMesh[v_offset + 1u], baseMesh[v_offset + 2u]);
    let v_norm = vec3<f32>(baseMesh[v_offset + 3u], baseMesh[v_offset + 4u], baseMesh[v_offset + 5u]);

    // 2. Read particle data
    let p_pos = positions[i_idx].xyz;
    let p_type = positions[i_idx].w; // 0.0 or 1.0

    // 3. Scale base mesh visually based on sigma (sigma represents diameter roughly)
    let visual_scale = params.sigma * 0.5;
    
    // Type 1 particles are slightly visually larger to correspond with their larger mass
    let type_scale_mod = mix(1.0, 1.2, p_type);
    
    let world_pos = (v_pos * visual_scale * type_scale_mod) + p_pos;

    // 4. Set vertex position & normal for rasterization
    out.position = camera.viewProjection * vec4<f32>(world_pos, 1.0);
    out.normal = (camera.view * vec4<f32>(v_norm, 0.0)).xyz;

    // 5. Determine base color by mixture type
    let colorType0 = vec3<f32>(0.2, 0.6, 1.0); // Cyan/Blue
    let colorType1 = vec3<f32>(1.0, 0.4, 0.1); // Orange/Red
    out.color = vec4<f32>(mix(colorType0, colorType1, p_type), 1.0);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Simple Lighting Model (Lambertian Diffuse + Ambient)
    let light_dir1 = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let light_dir2 = normalize(vec3<f32>(-1.0, 0.5, -0.5));
    
    let diffuse1 = max(dot(in.normal, light_dir1), 0.0) * 0.6;
    let diffuse2 = max(dot(in.normal, light_dir2), 0.0) * 0.3;
    let ambient = 0.2;
    
    let total_light = diffuse1 + diffuse2 + ambient;

    // Apply lighting to the assigned particle color
    let final_color = in.color.rgb * total_light;
    
    return vec4<f32>(final_color, 1.0);
}