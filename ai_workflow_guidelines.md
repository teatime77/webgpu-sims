# WebGPU Simulation Development Workflow for AI Assistants

This document explains the step-by-step workflow for creating WebGPU physics simulations in this project. As an AI assistant, you must strictly follow this process to ensure compatibility with the project's custom engine.

## The 3-Step Workflow

1.  **Generate the TypeScript Definition:** Write a `.ts` file that exports a `SimulationSchema` object. This defines the simulation's state, resources (buffers), compute/render nodes, initialization, and execution loop.
2.  **Generate the WGSL Skeleton (User Action):** The user will run `tools/generate_skeleton.ts <path-to-schema.ts>`. This script automatically creates `.wgsl` files for each node defined in the schema.
3.  **Implement the WGSL Logic:** You (the AI) will be provided with the generated `.wgsl` skeleton files. You must implement ONLY the core logic inside the generated functions (`vs_main`, `fs_main`, or `main`).

---

## 1. Writing the TypeScript Schema (`SimulationSchema`)

The `SimulationSchema` is the central blueprint for a simulation. It eliminates boilerplate by letting the TypeScript engine handle WebGPU API calls, buffer allocations, and pipeline creations.

### Key Properties of `SimulationSchema`

*   **`resources`**: Defines the data structures stored on the GPU.
    *   `type`: Can be `'uniform'`, `'storage'`, `'texture'`, or `'sampler'`.
    *   `fields` (for uniforms): A record of variable names and their WGSL types (e.g., `viewProjection: 'mat4x4<f32>'`). **Note on Padding:** The TypeScript `UniformManager` automatically calculates byte offsets based on WebGPU alignment rules. You should define the fields as they logically appear. Explicit padding (e.g., `pad1: 'f32'`) is supported to force alignment matching between TS and WGSL.
    *   `format` and `count` (for storage): Defines the WGSL type of a single element (e.g., `'vec4<f32>'`) and the total number of elements.
    *   `bufferCount`: Use `bufferCount: 2` (or more) to automatically create ping-pong buffers for history tracking (e.g., tracking `Psi` in QM simulations).

*   **`nodes`**: Defines the compute and render passes. Each node corresponds to a single `.wgsl` file that will be generated.
    *   `id`: The unique identifier for the pass. The generated file will be named `<node.id>.wgsl`.
    *   `type`: `'compute'` or `'render'`.
    *   `workgroupSize`: Defines the compute shader's local workgroup size (e.g., `[8, 8, 1]` or `64`).
    *   `bindings`: Maps the `resources` defined earlier to WGSL `@group(G) @binding(B)`. 
        *   The default value for `group` is `0`. The default value for `binding` is its index in the `bindings` array. Therefore, specifying `group` and `binding` explicitly is usually unnecessary.
        *   `varName`: Specifies the variable name used in the generated WGSL. This is especially useful for distinguishing multiple buffers of the same resource (e.g., in ping-pong buffers, using `varName: 'psiIn'` for `historyLevel: 1` and `varName: 'psiOut'` for `historyLevel: 0`). If omitted, the resource name is used.
        *   Specify `access: 'read_write'` or `'read'`. 
        *   Use `historyLevel: 1` to read from the previous frame's buffer in ping-pong setups (historyLevel 0 is the current write-target).

*   **`uis`**: Defines the user interface controls that interact with the simulation's state.
    *   It is an array of UI component definitions.
    *   Example for a range slider: `{ type: "range", obj: state, name: "temperature", label: "Temperature", min: 0.0, max: 3.0, step: 0.01 }`
    *   Example for a select dropdown: `{ type: "select", obj: state, name: "orbitalMode", label: "Orbital", reset: true, options: [{ value: 0, text: "1s" }] }`

*   **`script(runner)`**: A generator function (`function*`) that acts as both the initial setup and the execution loop.
    *   **Initialization:** At the beginning of the function (before the loop), set up initial GPU buffer data. You can write to storage buffers using `runner.writeStorage('ResourceName', Float32ArrayData)`.
    *   **Updating Uniforms:** To easily update uniform buffers without manually calculating padding or constructing `Float32Array`s, use the `SimulationRunner` helpers:
        *   `runner.writeUniformObject('ResourceName', dataObject)`: Automatically maps a JavaScript object to the schema's `fields`, handling WebGPU's strict 16-byte memory alignment and padding.
        *   `runner.writeUniformArray('ResourceName', dataArray)`: Maps a flat array of numbers to the uniform buffer while enforcing the schema's alignment rules.
    *   **Execution Loop:** Enter a `while (true)` loop to step through frames.
    *   Use `runner.compute('node_id', dispatchX, dispatchY, dispatchZ)` to dispatch compute shaders.
    *   Use `runner.render('node_id', vertexCount, instanceCount, hasDepth, canvasId)` to execute draw calls.
    *   Use `runner.swap('resource_name')` to flip ping-pong buffers at the end of a step.
    *   Use `yield 'frame';` to yield control back to the browser's `requestAnimationFrame`.

---

## 2. How `generate_skeleton.ts` Works

The `tools/generate_skeleton.ts` script is a crucial part of the pipeline. It reads the exported `SimulationSchema` and automatically generates boilerplate WGSL code.

**What it does:**
1.  **Reads the Schema:** It imports the `.ts` file and parses the `resources` and `nodes` arrays.
2.  **Generates Structs:** For every `uniform` resource bound to a node, it creates a perfectly formatted WGSL `struct` based on the `fields` defined in the TypeScript schema.
3.  **Generates Bindings:** It creates all `@group(X) @binding(Y) var<...>` statements exactly as specified in the `node.bindings` array. It automatically determines the correct `var<storage, read_write>` or `var<uniform>` syntax based on the schema's resource type.
4.  **Generates Entry Points:** It creates an empty `@compute fn main(...)` or `@vertex fn vs_main(...)` / `@fragment fn fs_main(...)` depending on the node type.
5.  **Writes to Disk:** It saves the output as `<node_id>.wgsl` in the same directory as the schema.

**Why this matters to the AI:**
Because the tool automatically generates all struct definitions and resource bindings, **you must never write WGSL structs or bindings from scratch**. If a binding or a struct field is missing or incorrect, the fix must be made in the TypeScript `SimulationSchema` first, and the skeleton must be regenerated.

---

## 3. Implementing the WGSL Logic

After the user runs the skeleton generator, they will provide you with the generated `.wgsl` files.

*   **DO NOT modify the auto-generated structs.**
*   **DO NOT modify the auto-generated `@group` and `@binding` declarations.**
*   Look for the comment block:
    ```wgsl
    // ==========================================
    // IMPLEMENT YOUR LOGIC BELOW
    // AI: Focus only on implementing the core logic for vs_main, fs_main, or compute main.
    // ==========================================
    ```
*   Your task is to write the mathematical and physical logic inside the empty `main`, `vs_main`, or `fs_main` functions provided in the skeleton.

### Example of AI WGSL implementation:
If the skeleton provides:
```wgsl
@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    // TODO: Write compute logic for particle_compute
}
```
You should only fill in the logic:
```wgsl
@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if (idx >= arrayLength(&particles)) { return; }
    particles[idx].y -= 9.8 * params.dt; // Apply gravity
}
```

## 4. Common WebGPU Gotchas & Best Practices

When implementing the TypeScript schema or WGSL logic, you MUST adhere to the following rules to prevent pipeline validation crashes and silent GPU failures:

### A. Dead-Code Elimination (The Binding Mismatch Trap)
**The Problem:** The WGSL compiler aggressively optimizes code. If you declare a binding in the TypeScript schema (e.g., passing a `Params` uniform to a render pass) but **never read from it** inside `vs_main` or `fs_main`, the compiler strips the binding entirely. WebGPU will then throw a `BindGroupLayout` validation error because the TS engine expects the binding to exist, but the compiled shader lacks it.
**The Rule:** Only bind resources in the `SimulationSchema` that are explicitly necessary for the shader's logic. If you change a shader's logic and stop using a buffer, you MUST remove that binding from the TypeScript schema and regenerate the skeleton.

### B. Safe Vertex Culling in Render Passes
**The Problem:** When you want to dynamically hide/cull a vertex (e.g., conditionally hiding particles), setting `out.position = vec4<f32>(0.0, 0.0, 0.0, 0.0);` causes a divide-by-zero error during the perspective divide. Some GPU drivers handle this silently, but others (like WebKit or certain Windows drivers) will panic and render a completely black screen.
**The Rule:** To cull a vertex safely, move it outside the visible clip space box using `W = 1.0`. 
* **Correct:** `out.position = vec4<f32>(2.0, 2.0, 2.0, 1.0);`

### C. Floating Point Underflow & Division by Zero
**The Problem:** In Monte Carlo simulations or physics equations, probabilities and distances can get extremely small, underflowing to exactly `0.0`. If this value is used in a division (e.g., `p_proposal / p_current`), it results in `NaN`, freezing the particle in place or blacking out the screen.
**The Rule:** Always guard divisions involving calculated densities or distances. Use `max(value, 1e-30)` to ensure denominators never hit absolute zero.