// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: particle_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    speedScale: f32,
    colorR: f32,
    colorG: f32,
    colorB: f32,
    init  : f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> baseMesh: array<f32>;
@group(0) @binding(3) var<uniform> params: ParamsStruct;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOutput {
    var out: VertexOutput;

    // 1. Get vertex data of the base mesh (6 elements: x, y, z, nx, ny, nz)
    let v_offset = v_idx * 6u;
    let v_pos = 0.02 * vec3<f32>(baseMesh[v_offset], baseMesh[v_offset + 1u], baseMesh[v_offset + 2u]);
    let v_norm = vec3<f32>(baseMesh[v_offset + 3u], baseMesh[v_offset + 4u], baseMesh[v_offset + 5u]);

    // 2. Get instance (particle) position
    let p_idx = i_idx * 2u;
    let p_pos = particles[p_idx].xyz;

    // 3. Calculate position in world space
    let world_pos = v_pos + p_pos;

    // 4. Convert to screen coordinates
    out.position = camera.viewProjection * vec4<f32>(world_pos, 1.0);

    // 5. Transform normal to camera space (for lighting)
    out.normal = (camera.view * vec4<f32>(v_norm, 0.0)).xyz;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Simple directional light
    let light_dir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    
    // Lambertian reflection (dot product of normal and light direction)
    let diffuse = max(dot(in.normal, light_dir), 0.0);
    
    // Ambient + Diffuse light
    let light = diffuse * 0.7 + 0.3;

    // Determine base color from UI parameters
    let base_color = vec3<f32>(params.colorR, params.colorG, params.colorB);

    return vec4<f32>(base_color * light, 1.0);
}