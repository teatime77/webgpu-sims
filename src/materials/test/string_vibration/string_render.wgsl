// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: string_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    time: f32,
    amplitude: f32,
    frequency: f32,
    speed: f32,
    segmentLength: f32,
    initialize: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> directions: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> tubeMesh: array<f32>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
    @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOutput {
    var out: VertexOutput;

    // 1. Read base tube geometry (makeTube packs 6 floats per vertex: pos3 + norm3)
    let v_offset = v_idx * 6u;
    let v_pos = vec3<f32>(tubeMesh[v_offset], tubeMesh[v_offset + 1u], tubeMesh[v_offset + 2u]);
    let v_norm = vec3<f32>(tubeMesh[v_offset + 3u], tubeMesh[v_offset + 4u], tubeMesh[v_offset + 5u]);

    // 2. Read instance physics data
    let p_pos = positions[i_idx].xyz;
    let dir_data = directions[i_idx];
    let v_dir = dir_data.xyz;
    let stretch = dir_data.w; // Computed arc-length from shader

    // 3. Construct Orthogonal Basis (Rotation Matrix)
    // The base tube is drawn along the +Z axis. We map +Z to our calculated tangent direction.
    let Z_prime = v_dir;
    let helper_up = vec3<f32>(0.0, 0.0, 1.0);
    
    // Cross products create perpendicular axes
    let X_prime = normalize(cross(helper_up, Z_prime));
    let Y_prime = cross(Z_prime, X_prime);
    let rot_mat = mat3x3<f32>(X_prime, Y_prime, Z_prime);

    // 4. Scale and Transform Geometry
    let xy_scale = 0.05; // Fixed tube thickness
    // Scale length by computed stretch plus a tiny 2% overlap to completely hide seams between segments
    let z_scale = stretch * 1.02; 
    let scaled_pos = vec3<f32>(v_pos.x * xy_scale, v_pos.y * xy_scale, v_pos.z * z_scale);

    let world_pos = rot_mat * scaled_pos + p_pos;
    let world_norm = rot_mat * v_norm;

    // 5. Output Camera Transforms
    out.position = camera.viewProjection * vec4<f32>(world_pos, 1.0);
    // Normals need to be rotated by the camera view matrix for accurate lighting
    out.normal = (camera.view * vec4<f32>(world_norm, 0.0)).xyz; 

    // 6. Generate an aesthetic gradient color across the length of the string
    let hue = f32(i_idx) / f32(arrayLength(&positions));
    out.color = vec4<f32>(1.0 - hue * 0.5, 0.6, 0.2 + hue * 0.8, 1.0);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Basic Lambertian Diffuse Lighting setup
    let light_dir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    let diffuse = max(dot(normalize(in.normal), light_dir), 0.0);
    let ambient = 0.3;
    
    let final_color = in.color.rgb * (diffuse * 0.7 + ambient);
    return vec4<f32>(final_color, 1.0);
}