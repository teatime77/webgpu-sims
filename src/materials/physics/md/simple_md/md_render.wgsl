// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: md_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    dt: f32,
    gravity: f32,
    interactionRadius: f32,
    stiffness: f32,
    boxSize: f32,
    time: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> positions: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> velocities: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> baseMesh: array<f32>;
@group(0) @binding(4) var<uniform> params: ParamsStruct;

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

    // 1. Read base mesh (Unit Sphere)
    let v_offset = v_idx * 6u;
    let v_pos = vec3<f32>(baseMesh[v_offset], baseMesh[v_offset + 1u], baseMesh[v_offset + 2u]);
    let v_norm = vec3<f32>(baseMesh[v_offset + 3u], baseMesh[v_offset + 4u], baseMesh[v_offset + 5u]);

    // 2. Read instance (Particle)
    let p_pos = positions[i_idx].xyz;
    let p_vel = velocities[i_idx].xyz;

    // 3. Scale base mesh to visually match the physical interaction radius
    // (Divide by 2 because radius is half of diameter, or adjust scale visually)
    let visual_scale = params.interactionRadius * 0.5;
    let world_pos = (v_pos * visual_scale) + p_pos;

    // 4. Transform positions and normals
    out.position = camera.viewProjection * vec4<f32>(world_pos, 1.0);
    out.normal = (camera.view * vec4<f32>(v_norm, 0.0)).xyz;

    // 5. Calculate color based on speed (Kinetic Energy)
    let speed = length(p_vel);
    let normalizedSpeed = clamp(speed / 10.0, 0.0, 1.0);
    let coldColor = vec3<f32>(0.1, 0.4, 1.0);
    let hotColor = vec3<f32>(1.0, 0.2, 0.1);
    
    out.color = vec4<f32>(mix(coldColor, hotColor, normalizedSpeed), 1.0);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Basic Directional Lighting (Lambertian)
    let light_dir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let diffuse = max(dot(in.normal, light_dir), 0.0);
    
    // Ambient + Diffuse
    let ambient = 0.3;
    let light = diffuse * 0.7 + ambient;

    // Multiply the particle's kinetic color by the calculated light
    return vec4<f32>(in.color.rgb * light, 1.0);
}