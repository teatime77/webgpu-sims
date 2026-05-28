struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> instances: array<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) world_pos: vec3<f32>, // Kept for flat lighting
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;

    // 1. Determine Triangle and Corner
    let tri_idx = v_idx / 3u;      // Which triangle is this? (0, 0, 0, 1, 1, 1, 2...)
    let corner_idx = v_idx % 3u;   // Which corner is this? (0, 1, 2, 0, 1, 2, 0...)

    // 13 floats per triangle
    let tri_offset = tri_idx * 13u;

    // 2. Read the specific position for this corner
    var pos: vec3<f32>;
    if (corner_idx == 0u) {
        pos = vec3<f32>(instances[tri_offset + 0u], instances[tri_offset + 1u], instances[tri_offset + 2u]);
    } else if (corner_idx == 1u) {
        pos = vec3<f32>(instances[tri_offset + 3u], instances[tri_offset + 4u], instances[tri_offset + 5u]);
    } else {
        pos = vec3<f32>(instances[tri_offset + 6u], instances[tri_offset + 7u], instances[tri_offset + 8u]);
    }

    // 3. Read the shared Color (Floats 9, 10, 11, 12 of the block)
    let color = vec4<f32>(
        instances[tri_offset + 9u],
        instances[tri_offset + 10u],
        instances[tri_offset + 11u],
        instances[tri_offset + 12u]
    );

    // 4. Transform and pass to fragment
    out.position = camera.viewProjection * vec4<f32>(pos, 1.0);
    out.color = color;
    out.world_pos = pos;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Dynamic Flat Lighting using Derivatives
    let dx = dpdx(in.world_pos);
    let dy = dpdy(in.world_pos);

    // Negate the result to flip the normal right-side up!
    let normal = -normalize(cross(dx, dy));    
    
    let light_dir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    let diffuse = max(dot(normal, light_dir), 0.0);
    let ambient = 0.2;
    let light_intensity = diffuse * 0.8 + ambient;

    return vec4<f32>(in.color.rgb * light_intensity, 1.0);
}