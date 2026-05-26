# WebGPU Simulation Architecture Overview

This architecture is a framework designed to integrate TypeScript, WebGPU, and WGSL for running highly efficient and safe physical simulations and graphics rendering directly in the browser.

The fundamental design philosophy is **the strict separation of the simulation's "blueprint" (a declarative schema) from its "orchestration" (procedural execution flow)**. By representing the entire pipeline through pure TypeScript objects and WebGPU execution functions, the architecture ensures maximum transparency, maintainability, and control over complex GPU calculations.

---

## The 4-Step Workflow

1.  **Generate the schema definition by TypeScript code:** You (the AI) will create a schema definition using TypeScript code, following the simulation execution instructions provided by the user. This defines the simulation's state, resources (buffers), compute/render nodes, UI definitions and script.
2.  **Generate the WGSL Skeleton (User Action):** The user will run this app to create WGSL codes from the schema. 
WGSL codes include struct definitions, resource bindings and skeleton functions.
3.  **Implement the WGSL Logic:** You (the AI) will be provided with the generated WGSL skeleton codes. 
You must implement ONLY the core logic inside the generated functions (`vs_main`, `fs_main`, or `main`).
4.  **Simulation execution:** The app will run the simulation using the schema and WGSL files.

---

## Schema Structure

This schema strictly separates state, memory allocation (resources), pipeline execution (shaders), user interface (UIs) and script.

## 1. Global State and Constants

Before defining the schema object, declare the simulation parameters and constants.

* **`state` Object:** A plain JavaScript object holding the mutable physics parameters (e.g., `brightness`, `scale`). This object will be referenced by both the Uniform buffers and the UI components.
* **Constants:** Define configuration constants like `NUM_PENDULUMS`, `SPHERE_DIVISION` and `gravitational constant`.

## 2. Schema Object

The `SimulationSchema` is a root object containing the following primary keys: `name`, `resources`, `shaders`, `uis` and `script`.

### A. `resources` (Object / The Memory Pool)

The `resources` field is a **Key-Value Dictionary (Object)**. Order does not matter. It acts as a centralized registry for all WebGPU buffers, uniforms, and meshes.

**Resource Types:**

* **Uniforms:**
* Format: `{ type: 'uniform', obj: [Reference to state object] }`

If the name of the uniform variable is `Params` and the object pointed to by `obj` has `time` property , the app sets the elapsed time to `time`.

The elapsed time is in seconds, and the value of `time` is 0 on the first shader call.

Compute shaders can perform initialization when the value of `time` is 0.

* **Storage Buffers:**
* Format: `{ type: 'storage', format: '[wgsl_type]', count: [Number], meshRef?: '[MeshKey]', topology?: '[Topology]', shadingModel?: '[ShadingModel]' }`

**Storage Buffer Rendering Modes:**
Depending on how the storage buffer is visualized, it must adhere to one of the following architectural patterns:

**1. Mesh Instancing **
If the buffer drives a 3D mesh (like a sphere or tube), include `meshRef`.
* `meshRef: "[MeshKey]"` (must match a key in the `resources` object).

**2. Procedural Topologies**
If the buffer generates procedural geometry without a mesh, specify a `topology`. The memory layout (stride) must strictly match the rules below to ensure the WebGPU vertex puller calculates offsets correctly. 

* `topology: "point-list"`
  * **Intent:** Draws 1-pixel points (e.g., massive particle swarms). 
  * **Memory Stride:** 8 floats per point `[x, y, z, pad, r, g, b, a]`.
  * **Count Calculation:** `NUM_POINTS * 8`

* `topology: "line-list"`
  * **Intent:** Draws 1-pixel line segments (e.g., vector fields, trails). 
  * **Memory Stride:** 12 floats per line `[pivot.x, pivot.y, pivot.z, vector.x, vector.y, vector.z, radius, pad, r, g, b, a]`.
  * **Count Calculation:** `NUM_LINES * 12`

* `topology: "triangle-list"`
  * **Intent:** Draws custom 3D surfaces (e.g., fluid grids, cloth, terrain).
  * **Requirement:** Must include a `shadingModel` to instruct the framework on how to unpack the memory and calculate normals. Supported shading models:
    * `"triangle-color"`: Processes per-triangle. Flat color per face.
      * **Memory Stride:** 13 floats per TRIANGLE `[x1, y1, z1, x2, y2, z2, x3, y3, z3, r, g, b, a]`.
      * **Count Calculation:** `NUM_TRIANGLES * 13`
    * `"vertex-color"`: Processes per-vertex. Colors interpolate smoothly. Flat normals are calculated dynamically in the fragment shader via `dpdx/dpdy`.
      * **Memory Stride:** 7 floats per VERTEX `[x, y, z, r, g, b, a]`.
      * **Count Calculation:** `NUM_VERTICES * 7`
    * `"vertex-color-normal"`: Processes per-vertex. Perfect smooth shading using explicit pre-calculated normals.
      * **Memory Stride:** 10 floats per VERTEX `[x, y, z, r, g, b, a, nx, ny, nz]`.
      * **Count Calculation:** `NUM_VERTICES * 10`

* **Meshes:**
* Format: `{ type: 'mesh', shape: '[tube|sphere|arrow]', division: [Number] }`


*AI Generation Rule:* Use exact object keys as the resource IDs. Ensure no duplicate keys exist.

### B. `shaders` (Array / The Execution Pipeline)

The `shaders` field is an **Array of Objects**. Order **strictly matters**. This represents the chronological sequence of compute or render passes.

**Shader Pass Properties:**

* `id`: A unique string identifier for the shader pass (e.g., `'pendulum_comp'`).
* `type`: The type of pass (e.g., `'compute'`).
* `workgroupSize`: Integer representing local invocation size (e.g., `64`).
* `workgroupCount`: Total dispatches (usually calculated via constants).
* `bindings`: An array mapping the previously defined `resources` to WGSL variables.
* `resource`: Must exactly match a key defined in the `resources` object.
* `varName`: The variable name to be injected into the WGSL code.
* `access`: Set to `'read_write'` for mutable storage buffers.



### C. `uis` (Array / The User Interface)

The `uis` field is an **Array of Objects**. It instructs the frontend on how to build the control panel, directly binding HTML elements to the `state` object.

**UI Component Properties:**

* `type`: Currently supports `"range"`, which maps to an HTML `<input type="range" />`.
* `obj`: Must reference the global `state` object.
* `name`: The exact key within the `state` object to mutate (e.g., `"gravity"`).
* `label`: Human-readable display text for the UI.
* `min` / `max` / `step`: Numeric constraints for the slider.

### D. `script` (optional)

By default, the shaders in `shaders` are executed sequentially once each time a frame is rendered.

If you want to change the number of times a specific shader is executed, you can specify this in a script.

For example, the following script executes shaderB three times.
```js
execute(shaderA);
for(const _ of range(3)){
    execute(shaderB);
}
execute(shaderC);
```

## Example Output Validation

When generating this schema, ensure that:

1. Every `resource` referenced in `shaders[].bindings` exists in the `resources` object.
2. Every `meshRef` referenced in a storage buffer exists as a `type: 'mesh'` resource.
3. Every `name` referenced in the `uis` array exists in the `state` object.

## 3. Common WebGPU Gotchas & Best Practices

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