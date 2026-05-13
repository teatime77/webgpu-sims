// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: physics_and_transform_compute
// ==========================================

struct ParamsStruct {
    dt: f32,
    gravity: f32,
    baseLength: f32,
    bobRadius: f32,
    stringThickness: f32,
    initialize: f32,
};

@group(0) @binding(0) var<uniform> params: ParamsStruct;
@group(0) @binding(1) var<storage, read_write> stateBuffer: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> tubeTransforms: array<f32>;
@group(0) @binding(3) var<storage, read_write> bobTransforms: array<f32>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

// Helper function to create a 4x4 Translation Matrix
fn make_translation(p: vec3<f32>) -> mat4x4<f32> {
    return mat4x4<f32>(
        1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        p.x, p.y, p.z, 1.0
    );
}

// Helper function to create a 4x4 Scale Matrix
fn make_scale(s: vec3<f32>) -> mat4x4<f32> {
    return mat4x4<f32>(
        s.x, 0.0, 0.0, 0.0,
        0.0, s.y, 0.0, 0.0,
        0.0, 0.0, s.z, 0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

// Since the TS schema defined the buffer as a flat array of floats ('f32'),
// we write the 16 matrix floats + 4 color floats = 20 floats sequentially.
fn write_tube_instance(idx: u32, model: mat4x4<f32>, color: vec4<f32>) {
    let offset = idx * 20u;
    tubeTransforms[offset + 0u] = model[0][0]; tubeTransforms[offset + 1u] = model[0][1]; tubeTransforms[offset + 2u] = model[0][2]; tubeTransforms[offset + 3u] = model[0][3];
    tubeTransforms[offset + 4u] = model[1][0]; tubeTransforms[offset + 5u] = model[1][1]; tubeTransforms[offset + 6u] = model[1][2]; tubeTransforms[offset + 7u] = model[1][3];
    tubeTransforms[offset + 8u] = model[2][0]; tubeTransforms[offset + 9u] = model[2][1]; tubeTransforms[offset + 10u]= model[2][2]; tubeTransforms[offset + 11u]= model[2][3];
    tubeTransforms[offset + 12u]= model[3][0]; tubeTransforms[offset + 13u]= model[3][1]; tubeTransforms[offset + 14u]= model[3][2]; tubeTransforms[offset + 15u]= model[3][3];
    tubeTransforms[offset + 16u]= color.r;     tubeTransforms[offset + 17u]= color.g;     tubeTransforms[offset + 18u]= color.b;     tubeTransforms[offset + 19u]= color.a;
}

fn write_bob_instance(idx: u32, model: mat4x4<f32>, color: vec4<f32>) {
    let offset = idx * 20u;
    bobTransforms[offset + 0u] = model[0][0]; bobTransforms[offset + 1u] = model[0][1]; bobTransforms[offset + 2u] = model[0][2]; bobTransforms[offset + 3u] = model[0][3];
    bobTransforms[offset + 4u] = model[1][0]; bobTransforms[offset + 5u] = model[1][1]; bobTransforms[offset + 6u] = model[1][2]; bobTransforms[offset + 7u] = model[1][3];
    bobTransforms[offset + 8u] = model[2][0]; bobTransforms[offset + 9u] = model[2][1]; bobTransforms[offset + 10u]= model[2][2]; bobTransforms[offset + 11u]= model[2][3];
    bobTransforms[offset + 12u]= model[3][0]; bobTransforms[offset + 13u]= model[3][1]; bobTransforms[offset + 14u]= model[3][2]; bobTransforms[offset + 15u]= model[3][3];
    bobTransforms[offset + 16u]= color.r;     bobTransforms[offset + 17u]= color.g;     bobTransforms[offset + 18u]= color.b;     bobTransforms[offset + 19u]= color.a;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    let num_pendulums = arrayLength(&stateBuffer);
    if (idx >= num_pendulums) { return; }

    // ==========================================
    // 1. PHYSICS INTEGRATION
    // ==========================================
    if (params.initialize == 1.0) {
        let z_offset = (f32(idx) - f32(num_pendulums) / 2.0) * 1.0;
        let frequency_factor = 1.0 + f32(idx) * 0.05;
        let L = params.baseLength / (frequency_factor * frequency_factor);
        stateBuffer[idx] = vec4<f32>(0.5, 0.0, z_offset, L); // theta, omega, z, L
        return;
    }

    var state = stateBuffer[idx];
    let theta = state.x;
    var omega = state.y;
    let z_offset = state.z;
    let L = state.w;

    omega += -(params.gravity / L) * sin(theta) * params.dt;
    let new_theta = theta + omega * params.dt;
    stateBuffer[idx] = vec4<f32>(new_theta, omega, z_offset, L);

    // ==========================================
    // 2. TRANSFORM MATRIX GENERATION
    // ==========================================
    let pivot = vec3<f32>(0.0, 0.0, z_offset);
    
    // --- TUBE (STRING) INSTANCE ---
    let string_dir = vec3<f32>(sin(new_theta), -cos(new_theta), 0.0);
    let Z_prime = string_dir;
    let helper_up = vec3<f32>(0.0, 0.0, 1.0); 
    let X_prime = normalize(cross(helper_up, Z_prime));
    let Y_prime = cross(Z_prime, X_prime);
    
    // Convert Orthogonal Basis vectors to a 4x4 Rotation Matrix
    let tube_rot = mat4x4<f32>(
        vec4<f32>(X_prime, 0.0),
        vec4<f32>(Y_prime, 0.0),
        vec4<f32>(Z_prime, 0.0),
        vec4<f32>(0.0, 0.0, 0.0, 1.0)
    );
    let tube_scale = make_scale(vec3<f32>(params.stringThickness, params.stringThickness, L));
    let tube_trans = make_translation(pivot);
    
    // Standard Transform Math: Model = Translation * Rotation * Scale
    let tube_model = tube_trans * tube_rot * tube_scale;
    let tube_color = vec4<f32>(0.7, 0.7, 0.7, 1.0);
    write_tube_instance(idx, tube_model, tube_color);

    // --- BOB (SPHERE) INSTANCE ---
    let bob_center = pivot + vec3<f32>(L * sin(new_theta), -L * cos(new_theta), 0.0);
    
    let bob_scale = make_scale(vec3<f32>(params.bobRadius, params.bobRadius, params.bobRadius));
    let bob_trans = make_translation(bob_center);
    
    // Bobs are spheres, so we don't need a rotation matrix! Model = Translation * Scale
    let bob_model = bob_trans * bob_scale;
    
    let hue = f32(idx) / f32(num_pendulums);
    let bob_color = vec4<f32>(0.2 + hue * 0.8, 0.6, 1.0 - hue * 0.5, 1.0);
    write_bob_instance(idx, bob_model, bob_color);
}