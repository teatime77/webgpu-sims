// ==========================================
// AUTO-GENERATED SKELETON FOR NODE: bec_debug_k1
// DO NOT MODIFY STRUCTS AND BINDINGS
// ==========================================

struct BecParamsStruct {
    gridWidth: f32,
    gridHeight: f32,
    temperature: f32,
    dt: f32,
    g: f32,
    omega: f32,
    particleNumber: f32,
    domainHalf: f32,
    time: f32,
    partialNormCount: f32,
    pad1: f32,
    pad2: f32,
};

@group(0) @binding(0) var<uniform> params: BecParamsStruct;
@group(0) @binding(1) var<storage, read> data: array<vec2<f32>>;

// ==========================================
// IMPLEMENT YOUR LOGIC BELOW
// ==========================================

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_idx: u32) -> VertexOutput {
    var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
    );
    // UV座標のセットアップ
    var uvs = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 0.0),
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(1.0, 0.0)
    );
    var out: VertexOutput;
    out.position = vec4<f32>(pos[vertex_idx], 0.0, 1.0);
    out.uv = uvs[vertex_idx];
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let w = i32(params.gridWidth);
    let h = i32(params.gridHeight);
    let x = i32(in.uv.x * f32(w));
    let y = i32(in.uv.y * f32(h));
    let idx = u32(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1));

    // 自動生成されたバインディング変数名 (data) から値を取得
    let val = data[idx];

    // 🚨 NaN（非数）チェッカー：計算崩壊が起きていれば一発で真っ赤に警告！
    if (val.x != val.x || val.y != val.y) {
        return vec4<f32>(1.0, 0.0, 0.0, 1.0);
    }

    // 勾配(K)の値を強調表示。白黒の強弱で波の動きが見えます。
    let mag = length(val) * 100.0;
    return vec4<f32>(mag, mag, mag, 1.0);
}