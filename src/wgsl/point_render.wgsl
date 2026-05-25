struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> instances: array<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(
    @builtin(vertex_index) v_idx: u32, 
    @builtin(instance_index) i_idx: u32 // 🌟 We must read the instance_index!
) -> VertexOutput {
    var out: VertexOutput;

    // 🌟 Use i_idx to offset into the instances array, NOT v_idx
    let i_offset = i_idx * 8u;
    
    let center = vec3<f32>(instances[i_offset + 0u], instances[i_offset + 1u], instances[i_offset + 2u]);
    let color = vec4<f32>(instances[i_offset + 4u], instances[i_offset + 5u], instances[i_offset + 6u], instances[i_offset + 7u]);

    out.position = camera.viewProjection * vec4<f32>(center, 1.0);
    out.color = color;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}