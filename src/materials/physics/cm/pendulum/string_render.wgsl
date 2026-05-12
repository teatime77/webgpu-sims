// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: string_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    dt: f32,
    gravity: f32,
    baseLength: f32,
    bobRadius: f32,
    stringThickness: f32,
    initialize: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<uniform> params: ParamsStruct;
@group(0) @binding(2) var<storage, read> stateBuffer: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> tubeMesh: array<f32>;

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

    // 1. Read base tube geometry
    let v_offset = v_idx * 6u;
    let v_pos = vec3<f32>(tubeMesh[v_offset], tubeMesh[v_offset + 1u], tubeMesh[v_offset + 2u]);
    let v_norm = vec3<f32>(tubeMesh[v_offset + 3u], tubeMesh[v_offset + 4u], tubeMesh[v_offset + 5u]);

    // 2. Read pendulum state
    let state = stateBuffer[i_idx];
    let theta = state.x;
    let z_offset = state.z;
    let L = state.w;

    // 3. Construct Rotation Matrix
    // The string points down, swinging along the X/Y plane
    let string_dir = vec3<f32>(sin(theta), -cos(theta), 0.0);
    
    // The base tube from `makeTube` is aligned along the +Z axis.
    // We map the local Z-axis to the physical string direction.
    let Z_prime = string_dir;
    let helper_up = vec3<f32>(0.0, 0.0, 1.0); 
    
    let X_prime = normalize(cross(helper_up, Z_prime));
    let Y_prime = cross(Z_prime, X_prime);
    let rot_mat = mat3x3<f32>(X_prime, Y_prime, Z_prime);

    // 4. Scale and Transform
    let scaled_pos = vec3<f32>(v_pos.x * params.stringThickness, v_pos.y * params.stringThickness, v_pos.z * L);
    
    // Apply rotation and translate to the pivot point along the Z axis
    let world_pos = rot_mat * scaled_pos + vec3<f32>(0.0, 0.0, z_offset);
    let world_norm = rot_mat * v_norm;

    // 5. Output
    out.position = camera.viewProjection * vec4<f32>(world_pos, 1.0);
    out.normal = (camera.view * vec4<f32>(world_norm, 0.0)).xyz;
    
    // Give the strings a neutral grey color
    out.color = vec4<f32>(0.7, 0.7, 0.7, 1.0);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let light_dir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    let diffuse = max(dot(normalize(in.normal), light_dir), 0.0);
    let ambient = 0.2;
    let light = diffuse * 0.8 + ambient;

    return vec4<f32>(in.color.rgb * light, 1.0);
}