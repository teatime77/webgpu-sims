// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: bob_render
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
@group(0) @binding(3) var<storage, read> bobMesh: array<f32>;

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

    // 1. Read base geodesic geometry
    let v_offset = v_idx * 6u;
    let v_pos = vec3<f32>(bobMesh[v_offset], bobMesh[v_offset + 1u], bobMesh[v_offset + 2u]);
    let v_norm = vec3<f32>(bobMesh[v_offset + 3u], bobMesh[v_offset + 4u], bobMesh[v_offset + 5u]);

    // 2. Read pendulum state
    let state = stateBuffer[i_idx];
    let theta = state.x;
    let z_offset = state.z;
    let L = state.w;

    // 3. Calculate Bob Center Position
    let pivot = vec3<f32>(0.0, 0.0, z_offset);
    let bob_center = pivot + vec3<f32>(L * sin(theta), -L * cos(theta), 0.0);

    // 4. Transform geometry
    let world_pos = v_pos * params.bobRadius + bob_center;
    // Bobs are spheres, so scaling doesn't change the normal directions
    let world_norm = v_norm; 

    // 5. Output
    out.position = camera.viewProjection * vec4<f32>(world_pos, 1.0);
    out.normal = (camera.view * vec4<f32>(world_norm, 0.0)).xyz;
    
    // Generate a beautiful gradient color based on the pendulum's index
    let hue = f32(i_idx) / f32(arrayLength(&stateBuffer));
    out.color = vec4<f32>(0.2 + hue * 0.8, 0.6, 1.0 - hue * 0.5, 1.0);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Add a slightly shinier specular feel for the bobs
    let light_dir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    let view_dir = vec3<f32>(0.0, 0.0, 1.0); // Simplified view dir
    let half_vector = normalize(light_dir + view_dir);
    
    let normal = normalize(in.normal);
    let diffuse = max(dot(normal, light_dir), 0.0);
    let specular = pow(max(dot(normal, half_vector), 0.0), 32.0);
    
    let ambient = 0.2;
    let light_intensity = diffuse * 0.7 + specular * 0.3 + ambient;

    return vec4<f32>(in.color.rgb * light_intensity, 1.0);
}