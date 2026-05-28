// ==========================================
// SKELETON FOR NODE: tri_vertex_color_render
// SHADING MODEL: 'vertex-color' (Stride: 7)
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> instances: array<f32>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) world_pos: vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;

    // The data layout is: Position(3) + Color(4) = 7 floats per vertex
    let stride = 7u;
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

    // 3. Transform to camera space
    out.position = camera.viewProjection * vec4<f32>(pos, 1.0);
    out.color = color;
    out.world_pos = pos;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let dx = dpdx(in.world_pos);
    let dy = dpdy(in.world_pos);

    // Negate the result to flip the normal right-side up!
    let normal = -normalize(cross(dx, dy));    
    
    // 1. Key Light (Main Sun) - from top/right
    let light1_dir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    let diff1 = max(dot(normal, light1_dir), 0.0);

    // 2. Fill Light - from opposite side (bottom/left) to kill black shadows
    let light2_dir = normalize(vec3<f32>(-1.0, 1.0, -1.0));
    let diff2 = max(dot(normal, light2_dir), 0.0) * 0.5; // 0.5 makes it softer than the main light

    // Combine lights
    let ambient = 0.3;
    let light_intensity = (diff1 + diff2) * 0.7 + ambient;

    return vec4<f32>(in.color.rgb * light_intensity, 1.0);
}