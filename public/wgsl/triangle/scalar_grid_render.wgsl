struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> scalars: array<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

// Generates a full-screen quad without any vertex buffers!
@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;
    
    // Magic formula to generate a full screen triangle/quad using just vertex IDs (0 to 5)
    let uv_x = f32((v_idx << 1u) & 2u);
    let uv_y = f32(v_idx & 2u);
    
    out.uv = vec2<f32>(uv_x, uv_y);
    
    // Map UVs (0 to 1) to Clip Space (-1 to 1)
    out.position = vec4<f32>(uv_x * 2.0 - 1.0, 1.0 - uv_y * 2.0, 0.0, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // 1. Define your grid size (This could be passed via uniforms)
    let GRID_DIM = 32.0; 
    
    // 2. Map the 0.0 -> 1.0 UV coordinates to integer Grid Coordinates
    let grid_x = u32(in.uv.x * GRID_DIM);
    let grid_y = u32(in.uv.y * GRID_DIM);
    
    // 3. Calculate 1D array index
    let idx = grid_y * u32(GRID_DIM) + grid_x;
    
    // 4. Fetch the raw scalar (e.g., Topological Charge Q or Higgs Phase)
    let val = scalars[idx];
    
    // 5. Map the scalar to a color (Example: Blue for negative, Red for positive)
    var color = vec3<f32>(0.0, 0.0, 0.0);
    
    if (val < 0.0) {
        color = vec3<f32>(0.1, 0.2, 0.8) * abs(val); // Blue intensity
    } else if (val > 0.0) {
        color = vec3<f32>(0.8, 0.1, 0.1) * val;      // Red intensity
    } else {
        color = vec3<f32>(0.1, 0.1, 0.1);            // Neutral/Zero
    }

    return vec4<f32>(color, 1.0);
}