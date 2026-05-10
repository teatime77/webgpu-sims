# WebGPU Simulation Architecture Overview

This architecture is an advanced framework designed to integrate TypeScript, WebGPU, and WGSL for running highly efficient and safe physical simulations and graphics rendering directly in the browser.

The fundamental design philosophy is **the strict separation of the simulation's "blueprint" (a declarative schema) from its "orchestration" (procedural execution flow)**. By representing the entire pipeline through pure TypeScript objects and generator functions, the architecture ensures maximum transparency, maintainability, and control over complex GPU calculations.

---

## 1. The Declarative Schema: Defining the Simulation

A complete simulation is defined as a single TypeScript object, typically located within a directory like `src/materials/test/` (e.g., `ParticleSim.ts`). This schema is divided into four distinct sections:

### ① Resources (`resources`)

This section defines the GPU memory buffers required by the simulation.

* **`type: 'uniform'`**: Used for broadcasting constant parameters (e.g., camera matrices, UI slider values) across all shader threads. The architecture strictly enforces **16-byte alignment** (multiples of 4 `f32` values) to comply with WebGPU specifications.
* **`type: 'storage'`**: Used for large-scale, read/write numerical data, such as particle positions or grid states.
* **Ping-Pong Buffers**: By specifying `bufferCount: 2`, the engine automatically provisions a pair of buffers. This facilitates time-evolution calculations (e.g., reading from a "past" state while writing to a "current" state) without memory access conflicts.

### ② Nodes (`nodes`)

Nodes define the atomic compute and render passes that will execute on the GPU.

* **`id`**: Corresponds directly to a specific WGSL shader file (e.g., `Particle_comp.wgsl`).
* **`bindings`**: Maps the buffers defined in `resources` to the `@group(0) @binding(n)` slots in the WGSL code.
* Setting `historyLevel: 1` instructs the engine to automatically bind the "previous" state of a ping-pong buffer.


* **Pipeline States**: For render passes, this section defines the graphics pipeline configurations, such as `topology` (e.g., `'point-list'`), `blendMode`, and `depthTest`.

### ③ Initialization (`init`)

An asynchronous function that executes exactly once when the simulation loads. It handles CPU-side setup, such as generating initial random seeds, writing initial distributions to GPU buffers, and constructing the User Interface (UI) panels.

### ④ The Execution Script (`script`)

The "soul" of the simulation. This is written as a **TypeScript generator function (`function*`)** that dictates the exact order of GPU operations.

* **Transparent Control Flow**: Standard TypeScript constructs like `while(true)` loops are used. Inside the loop, the script yields commands (e.g., `yield call('node_id')`, `yield swap('resource')`).
* **Transparent Control Flow**: Standard TypeScript constructs like `while(true)` loops are used. Inside the loop, the script calls execution methods on the runner (e.g., `runner.compute('node_id')`, `runner.render('node_id')`, `runner.swap('resource')`).
* **`yield 'frame'`**: This acts as a synchronization barrier. It signals to the engine that all commands for the current iteration have been recorded and should be submitted to the GPU.

---

## 2. Engine Internal Implementation: Technical Details

The core engine (e.g., the `SimulationRunner`) consumes the declarative schema, abstracts away the verbose WebGPU boilerplate, and orchestrates the execution loop.

### 2.1. Resource Manager: Dynamic Allocation

The engine parses the `resources` section and constructs the physical `GPUBuffer` instances.

* **Automatic Usage Flags**: The engine intelligently assigns bitmasks based on the resource type. `uniform` buffers receive `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST`, while `storage` buffers receive `STORAGE | COPY_SRC | COPY_DST`.
* **History Pointers**: For ping-pong buffers (`bufferCount: 2`), the engine maintains an internal state array (e.g., `[0, 1]`). When `swap('resource_name')` is yielded by the script, the engine flips these indices, instantly swapping the read/write roles of the physical buffers without moving any actual memory.

### 2.2. Pipeline Builders & Binding Resolution

Each `node` is encapsulated by a specific builder class (`ComputePassBuilder` or `RenderPassBuilder`).

* **Dynamic Bind Groups**: Before execution, the engine reads the `bindings` array and constructs `GPUBindGroup` objects. It resolves `historyLevel` requests on the fly by fetching the correct buffer index from the Resource Manager's History Pointers.
* **Asynchronous Shader Fetching**: The engine utilizes bundler features (like Vite's `import.meta.glob`) to dynamically fetch, compile, and cache the required `.wgsl` source codes at runtime based on the schema's file path.

### 2.3. Generator Orchestration & Frame Synchronization

The engine drives the simulation by iterating through the generator object.

1. **Encoder Initialization**: At the start of a frame, a fresh `GPUCommandEncoder` is instantiated.
2. **Command Recording**: As the script calls `runner.compute('node_id')` or `runner.render('node_id')`, the corresponding Builder class records either a `beginComputePass` or `beginRenderPass` into the encoder, along with its dynamically resolved bind groups and dispatch/draw sizes.
3. **Queue Submission**: When the generator yields `'frame'`, the engine calls `finish()` on the command encoder. The resulting command buffer is then dispatched via `device.queue.submit()`.

### 2.4. Memory Alignment and Data Transfer Safety

To prevent catastrophic numerical explosions (e.g., `NaN` proliferation) caused by WebGPU's strict memory layout rules, the architecture enforces a low-level approach to data transfer.

* **Direct `Float32Array` Writes**: Instead of relying on the engine to automatically parse and serialize generic JavaScript objects, developers are encouraged to format parameters into a strict `Float32Array`.
* **Explicit Padding**: If the total size of the variables does not meet the 16-byte multiple requirement, dummy variables (padding) must be explicitly added to the array. This array is then written directly to VRAM using `device.queue.writeBuffer`. This guarantees a 1:1 byte-level match between the CPU's data structure and the WGSL `struct`, eliminating the risk of data misalignment.

## Engine Internal Implementation: A Technical Deep Dive

The core engine (primarily the `SimulationRunner` and its associated builder classes) acts as the bridge between the declarative TypeScript schema and the low-level WebGPU API. Its primary role is to interpret the schema, manage GPU resources, construct execution pipelines dynamically, and safely orchestrate the simulation loop.

#### 1. Resource Manager: Dynamic Allocation and History Tracking

The engine parses the `resources` section of the schema to provision and manage physical `GPUBuffer` instances.

* **Automatic Usage Flagging**: The engine intelligently assigns WebGPU buffer usage flags based on the `type` defined in the schema.
* `uniform` buffers are automatically assigned `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST`.
* `storage` buffers are assigned `GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC`.


* **Ping-Pong Buffer Management**: When a resource specifies `bufferCount: 2`, the engine automatically allocates an array of two distinct physical buffers.
* **History Pointers**: The engine maintains internal state indices (e.g., `[0, 1]`) to track which buffer is the "current" (write) buffer and which is the "history" (read) buffer.
* When the generator script calls `runner.swap('resource_name')`, the engine simply flips these internal indices (e.g., from `[0, 1]` to `[1, 0]`). This instantly swaps the roles of the physical buffers without requiring any expensive memory copying operations.



#### 2. Pipeline Builders and Binding Resolution

Each `node` defined in the schema is encapsulated by a specialized builder class (`ComputePassBuilder` or `RenderPassBuilder`). These builders handle the complex task of connecting WGSL shaders to the correct physical buffers.

* **Dynamic Bind Group Construction**: Before execution, the engine reads the `bindings` array for a node. It fetches the corresponding physical `GPUBuffer` from the Resource Manager and constructs a `GPUBindGroup`.
* **On-the-Fly History Resolution**: If a binding specifies `historyLevel: 1`, the builder queries the Resource Manager for the buffer index corresponding to the "previous" state, ensuring the shader reads from the correct physical buffer during time-evolution calculations.
* **Asynchronous Shader Fetching**: The engine utilizes bundler capabilities (like Vite's `import.meta.glob`) to dynamically fetch the required `.wgsl` source code at runtime, based on the node's `id` and the schema's directory path. This compiles the necessary `GPUComputePipeline` or `GPURenderPipeline`.

#### 3. Generator Orchestration and Frame Synchronization

The execution loop is driven by the engine iterating through the TypeScript generator function (`script`) defined in the schema. This provides a transparent and sequential control flow over asynchronous GPU operations.

1. **Command Encoder Initialization**: At the beginning of each frame, the engine creates a fresh `GPUCommandEncoder`.
2. **Command Recording**: As the generator executes a `runner.compute(...)` or `runner.render(...)` instruction, the corresponding builder class records either a `beginComputePass` or `beginRenderPass` onto the encoder. It binds the dynamically resolved `GPUBindGroup`s and specifies the dispatch sizes or vertex counts.
3. **Queue Submission**: The execution barrier is the `yield 'frame'` instruction. When the generator yields this, it signals the end of the current iteration. The engine calls `finish()` on the command encoder and submits the resulting command buffer to `device.queue.submit()`. This dispatches all recorded operations to the GPU for execution, and control is returned to the browser's requestAnimationFrame loop.

#### 4. Memory Alignment and Data Transfer Safety

A critical responsibility of the engine, especially in V1.5, is ensuring the safe and precise transfer of data from the CPU to the GPU. WebGPU imposes strict memory layout rules that must be respected to prevent catastrophic numerical errors (like the `NaN` explosions observed in earlier debugging sessions).

* **The 16-Byte Alignment Rule**: WebGPU requires `uniform` buffers to be sized in multiples of 16 bytes (the size of a `vec4<f32>` or four `f32` values).
* **Direct Memory Access via `Float32Array**`: The V1.5 architecture strongly recommends bypassing high-level object serialization (like an `updateVariables` method that accepts a generic JavaScript object). Instead, developers must construct a strict `Float32Array` containing the exact values in the correct order.
* **Explicit Padding**: If the total size of the simulation parameters is not a multiple of 16 bytes (e.g., 10 variables = 40 bytes), developers must add explicit dummy variables (padding) to both the schema definition (to ensure the buffer is allocated correctly) and the `Float32Array` (e.g., adding two `0.0` values to reach 48 bytes).
* **Direct Buffer Writing**: The `Float32Array` is then written directly to VRAM using `device.queue.writeBuffer(buffer, offset, array)`. This guarantees a 1:1 byte-level match between the CPU data structure and the WGSL `struct`, completely eliminating risks of data misalignment caused by automatic serialization engines.