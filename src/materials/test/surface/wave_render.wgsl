// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: wave_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> normals: array<vec4<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) world_height: f32, // Pass the height to the fragment shader for coloring
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;
    
    // As we use a triangle-list and no instancing, vertex_index corresponds directly to the array index
    let pos = positions[v_idx].xyz;
    let norm = normals[v_idx].xyz;

    // Transform position to clip space
    out.position = camera.viewProjection * vec4<f32>(pos, 1.0);
    
    // Transform normal to camera/view space for lighting calculation
    out.normal = (camera.view * vec4<f32>(norm, 0.0)).xyz;
    
    // Pass the Y value (height) for color mapping
    out.world_height = pos.y;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // 1. Color mapping based on height
    let deep_water = vec3<f32>(0.0, 0.15, 0.5); // Dark blue for troughs
    let crest_water = vec3<f32>(0.0, 0.8, 0.9); // Bright cyan for peaks
    
    // Use smoothstep to map the height roughly between -1.0 and 1.0 to a 0.0 -> 1.0 mix factor
    let mix_factor = smoothstep(-1.0, 1.0, in.world_height);
    let base_color = mix(deep_water, crest_water, mix_factor);

    // 2. Lighting (Lambertian)
    let n = normalize(in.normal);
    let light_dir = normalize(vec3<f32>(0.5, 1.0, 0.3)); // Sun pointing down and slightly angled
    
    let diffuse = max(dot(n, light_dir), 0.0);
    
    // Add some ambient light so the shadows aren't pitch black
    let ambient = 0.2;
    let light_intensity = diffuse * 0.8 + ambient;

    // Output final lit color
    return vec4<f32>(base_color * light_intensity, 1.0);
}