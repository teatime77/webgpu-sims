// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: particle_render
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct CameraStruct {
    viewProjection: mat4x4<f32>,
    view: mat4x4<f32>,
};

struct ParamsStruct {
    speedScale: f32,
    colorR: f32,
    colorG: f32,
    colorB: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraStruct;
@group(0) @binding(1) var<storage, read> particles: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> baseMesh: array<f32>;
@group(0) @binding(3) var<uniform> params: ParamsStruct;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) normal: vec3<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) v_idx: u32, @builtin(instance_index) i_idx: u32) -> VertexOutput {
    var out: VertexOutput;

    // 1. ベースメッシュの頂点データの取得 (x, y, z, nx, ny, nz の6要素)
    let v_offset = v_idx * 6u;
    let v_pos = vec3<f32>(baseMesh[v_offset], baseMesh[v_offset + 1u], baseMesh[v_offset + 2u]);
    let v_norm = vec3<f32>(baseMesh[v_offset + 3u], baseMesh[v_offset + 4u], baseMesh[v_offset + 5u]);

    // 2. インスタンス(パーティクル)の位置を取得
    let p_idx = i_idx * 2u;
    let p_pos = particles[p_idx].xyz;

    // 3. ワールド空間での位置を計算
    let world_pos = v_pos + p_pos;

    // 4. 画面上の座標に変換
    out.position = camera.viewProjection * vec4<f32>(world_pos, 1.0);

    // 5. 法線をカメラ空間へ変換 (ライティング用)
    out.normal = (camera.view * vec4<f32>(v_norm, 0.0)).xyz;

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // 簡単な平行光源
    let light_dir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    
    // ランバート反射 (法線とライトの向きの内積)
    let diffuse = max(dot(in.normal, light_dir), 0.0);
    
    // 環境光(Ambient) + 拡散光(Diffuse)
    let light = diffuse * 0.7 + 0.3;

    // UIから渡されたパラメータでベースカラーを決定
    let base_color = vec3<f32>(params.colorR, params.colorG, params.colorB);

    return vec4<f32>(base_color * light, 1.0);
}