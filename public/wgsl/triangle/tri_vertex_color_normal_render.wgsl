// ==========================================
// SKELETON FOR NODE: tri_lit_render
// SHADING MODEL: 'vertex-color-normal' (Stride: 10)
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> instances: array<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec3<f32>, // 🌟 Explicit smooth normal
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;

    // Layout: Position(3) + Color(4) + Normal(3) = 10 floats per vertex
    let stride = 10u;
    let v_offset = v_idx * stride;

    // 1. Read Position (Floats 0, 1, 2)
    let pos = vec3<f32>(
        instances[v_offset + 0u], 
        instances[v_offset + 1u], 
        instances[v_offset + 2u]
    );
    
    // 2. Read Color (Floats 3, 4, 5, 6)
    let color = vec4<f32>(
        instances[v_offset + 3u], 
        instances[v_offset + 4u], 
        instances[v_offset + 5u], 
        instances[v_offset + 6u]
    );

    // 3. Read Normal (Floats 7, 8, 9)
    let norm = vec3<f32>(
        instances[v_offset + 7u], 
        instances[v_offset + 8u], 
        instances[v_offset + 9u]
    );

    out.position = camera.viewProjection * vec4<f32>(pos, 1.0);
    out.color = color;
    
    // Pass the world-space normal to the fragment shader for interpolation
    out.normal = norm; 

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // The GPU automatically interpolated the normal, but interpolation can slightly 
    // change its length, so we normalize it one more time to be safe.
    let normal = normalize(in.normal);
    
    // 1. Key Light (Main Sun) 
    let light1_dir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    let diff1 = max(dot(normal, light1_dir), 0.0);

    // 2. Fill Light 
    let light2_dir = normalize(vec3<f32>(-1.0, 1.0, -1.0));
    let diff2 = max(dot(normal, light2_dir), 0.0) * 0.5;

    let ambient = 0.3;
    let light_intensity = (diff1 + diff2) * 0.7 + ambient;

    return vec4<f32>(in.color.rgb * light_intensity, 1.0);
}