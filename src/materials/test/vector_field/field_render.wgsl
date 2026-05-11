// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: field_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    time: f32,
    fieldScale: f32,
    pad1: f32,
    pad2: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> vectors: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> arrowMesh: array<f32>;
@group(0) @binding(4) var<uniform> params: ParamsStruct;

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

    // 1. Read base arrow geometry (points along +Y axis by default)
    let v_offset = v_idx * 6u;
    let v_pos = vec3<f32>(arrowMesh[v_offset], arrowMesh[v_offset + 1u], arrowMesh[v_offset + 2u]);
    let v_norm = vec3<f32>(arrowMesh[v_offset + 3u], arrowMesh[v_offset + 4u], arrowMesh[v_offset + 5u]);

    // 2. Read instance data
    let p_pos = positions[i_idx].xyz;
    let vec_data = vectors[i_idx];
    let v_dir = vec_data.xyz;
    let mag = vec_data.w;

    // If the vector is near zero, collapse the vertex to hide the arrow
    if (mag < 0.0001) {
        out.position = vec4<f32>(0.0);
        return out;
    }

    // 3. Construct a Rotation Matrix to point the arrow
    let dir = v_dir / mag; // Normalized direction (this will be our new Up/Y-axis)
    
    // Pick an arbitrary orthogonal vector to help calculate the right and forward axes
    var helper_up = vec3<f32>(1.0, 0.0, 0.0);
    // If the direction is too close to our helper, switch the helper to avoid zero cross products
    if (abs(dir.x) > 0.9) {
        helper_up = vec3<f32>(0.0, 0.0, 1.0);
    }

    // Calculate orthogonal basis vectors (X', Y', Z')
    let Z_prime = normalize(cross(helper_up, dir));
    let X_prime = normalize(cross(dir, Z_prime));
    let Y_prime = dir; // Arrow originally pointed up (+Y), so this maps to the vector direction

    // Matrix to rotate the base arrow into the vector's alignment
    let rot_mat = mat3x3<f32>(X_prime, Y_prime, Z_prime);

    // 4. Scale and Transform the Position
    // Base arrow length is 1.0. We scale it down so it fits in the grid spacing (0.5).
    let scale = mag * params.fieldScale * 0.15;
    let scaled_pos = v_pos * scale;
    
    // Apply rotation
    let rotated_pos = rot_mat * scaled_pos;
    let rotated_norm = rot_mat * v_norm;

    // Move to grid position
    let world_pos = rotated_pos + p_pos;

    // 5. Output Screen Position & Camera Normal
    out.position = camera.viewProjection * vec4<f32>(world_pos, 1.0);
    out.normal = (camera.view * vec4<f32>(rotated_norm, 0.0)).xyz;

    // 6. Color mapping based on direction
    // Map normalized vector components [-1, 1] into RGB [0, 1] range
    let color_rgb = dir * 0.5 + 0.5;
    out.color = vec4<f32>(color_rgb, 1.0);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Basic Lambertian Lighting
    let light_dir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    let diffuse = max(dot(normalize(in.normal), light_dir), 0.0);
    
    let ambient = 0.3;
    let light = diffuse * 0.7 + ambient;

    // Multiply the directional color by the lighting intensity
    return vec4<f32>(in.color.rgb * light, 1.0);
}