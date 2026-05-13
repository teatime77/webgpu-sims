// ==========================================
// AUTO-GENERATED SKELETON 
// (This same code is used for tube_render and bob_render)
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> instances: array<f32>;
@group(0) @binding(2) var<storage, read> vertexData: array<f32>;

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

    // 1. Read the raw vertex geometry (6 floats per vertex: X, Y, Z, NX, NY, NZ)
    let v_offset = v_idx * 6u;
    let v_pos = vec3<f32>(vertexData[v_offset], vertexData[v_offset + 1u], vertexData[v_offset + 2u]);
    let v_norm = vec3<f32>(vertexData[v_offset + 3u], vertexData[v_offset + 4u], vertexData[v_offset + 5u]);

    // 2. Read the instance transform matrix and color (20 floats per instance)
    let i_offset = i_idx * 20u;
    
    // Reconstruct the 4x4 Model Matrix
    let model_matrix = mat4x4<f32>(
        instances[i_offset + 0u],  instances[i_offset + 1u],  instances[i_offset + 2u],  instances[i_offset + 3u],
        instances[i_offset + 4u],  instances[i_offset + 5u],  instances[i_offset + 6u],  instances[i_offset + 7u],
        instances[i_offset + 8u],  instances[i_offset + 9u],  instances[i_offset + 10u], instances[i_offset + 11u],
        instances[i_offset + 12u], instances[i_offset + 13u], instances[i_offset + 14u], instances[i_offset + 15u]
    );
    
    // Reconstruct the Color
    let instance_color = vec4<f32>(
        instances[i_offset + 16u], instances[i_offset + 17u], 
        instances[i_offset + 18u], instances[i_offset + 19u]
    );

    // 3. The Core Graphics Math: Multiply Position by the Model Matrix
    // This instantly translates, rotates, and scales the vertex into the physical world!
    let world_pos = model_matrix * vec4<f32>(v_pos, 1.0);
    
    // Rotate the normals so lighting still looks correct after the object rotates
    // (Note: we use 0.0 for the W component so normals aren't translated)
    let world_norm = model_matrix * vec4<f32>(v_norm, 0.0);

    // 4. Output to screen
    out.position = camera.viewProjection * world_pos;
    out.normal = (camera.view * world_norm).xyz;
    out.color = instance_color;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // A beautiful, generic lighting setup that looks good on any shape
    let light_dir = normalize(vec3<f32>(1.0, 2.0, 1.0));
    let view_dir = vec3<f32>(0.0, 0.0, 1.0); 
    
    let normal = normalize(in.normal);
    
    // Diffuse lighting
    let diffuse = max(dot(normal, light_dir), 0.0);
    
    // Specular highlight (makes objects look slightly glossy)
    let half_vector = normalize(light_dir + view_dir);
    let specular = pow(max(dot(normal, half_vector), 0.0), 32.0);
    
    let ambient = 0.2;
    let light_intensity = diffuse * 0.7 + specular * 0.2 + ambient;

    // Multiply the object's unique color by the calculated light
    return vec4<f32>(in.color.rgb * light_intensity, in.color.a);
}