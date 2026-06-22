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

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;
    
    // Explicitly define a square quad using 2 triangles (6 vertices)
    var uvs = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), // Top-Left
        vec2<f32>(1.0, 0.0), // Top-Right
        vec2<f32>(0.0, 1.0), // Bottom-Left
        
        vec2<f32>(0.0, 1.0), // Bottom-Left
        vec2<f32>(1.0, 0.0), // Top-Right
        vec2<f32>(1.0, 1.0)  // Bottom-Right
    );
    
    let uv = uvs[v_idx];
    out.uv = uv;
    
    // Map the 0->1 UVs to a physical 32x32 unit size in world space
    let world_pos = vec4<f32>(
        (uv.x * 2.0 - 1.0) * 16.0, 
        (1.0 - uv.y * 2.0) * 16.0, 
        0.0, 
        1.0
    );
    
    // Apply 3D Camera Projection
    out.position = camera.viewProjection * world_pos;
    
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let GRID_DIM = 32.0; 
    
    let grid_x = u32(in.uv.x * GRID_DIM);
    let grid_y = u32(in.uv.y * GRID_DIM);
    
    let idx = grid_y * u32(GRID_DIM) + grid_x;
    let val = scalars[idx];
    
    var color = vec3<f32>(0.0, 0.0, 0.0);
    
    if (val < 0.0) {
        color = vec3<f32>(0.1, 0.2, 0.8) * abs(val);
    } else if (val > 0.0) {
        color = vec3<f32>(0.8, 0.1, 0.1) * val;      
    } else {
        color = vec3<f32>(0.1, 0.1, 0.1);            
    }

    return vec4<f32>(color, 1.0);
}