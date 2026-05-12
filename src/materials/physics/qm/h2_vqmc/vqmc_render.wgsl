// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: vqmc_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    spinState: f32,
    bondLength: f32,
    jastrow: f32,
    pinX: f32,
    pinY: f32,
    pinZ: f32,
    samplingStep: f32,
    brightness: f32,
    resetFlag: f32,
    pad1: f32,
    pad2: f32,
    pad3: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> e1_pos: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> e2_pos: array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params: ParamsStruct;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32) -> VertexOutput {
    var out: VertexOutput;
    
    let r1 = e1_pos[v_idx].xyz;
    let r2 = e2_pos[v_idx].xyz;
    
    let pin = vec3<f32>(params.pinX, params.pinY, params.pinZ);
    let dist_to_pin = length(r1 - pin);
    
    // ★ FIX 1: Double the slice thickness to allow more walkers to be visible
    let tolerance = 0.8; 

    if (dist_to_pin > tolerance) {
        // ★ FIX 2: Safely cull by moving the point outside the clip space box (z = 2.0)
        out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0); 
        out.color = vec4<f32>(0.0);
        return out;
    }

    out.position = camera.viewProjection * vec4<f32>(r2, 1.0);
    let intensity = 1.0 - (dist_to_pin / tolerance);

    let colorSinglet = vec3<f32>(0.2, 0.8, 1.0);
    let colorTriplet = vec3<f32>(1.0, 0.4, 0.1);
    let baseColor = mix(colorSinglet, colorTriplet, params.spinState);

    // ★ FIX 3: Multiply brightness by 5.0 to compensate for the heavy filtering!
    out.color = vec4<f32>(baseColor * params.brightness * intensity * 5.0, 1.0);
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    return in.color;
}