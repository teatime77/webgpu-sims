import { vec3, mat4 } from "gl-matrix";

export class OrbitCamera {
    private canvas: HTMLCanvasElement;
    
    // --- Polar coordinate parameters of the camera ---
    public target = vec3.clone([0.0, 0.0, 0.0]); // Target point (moved by panning)
    public distance: number = 40.0;        // Distance to the camera (changed by zooming)
    public theta: number = 0.0;            // Horizontal angle (changed by rotation)
    public phi: number = Math.PI / 3;      // Vertical angle (changed by rotation)

    // --- Internal state of mouse operations ---
    private isDragging = false;
    private dragButton = -1;
    private lastMouseX = 0;
    private lastMouseY = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.attachEvents();
    }

    rotateCamera(dx: number, dy: number){
        // [Left click: Orbit]
        this.theta -= dx;
        this.phi -= dy;
        // Limit phi (prevent flipping over straight up/down)
        const epsilon = 0.001;
        this.phi = Math.max(epsilon, Math.min(Math.PI - epsilon, this.phi));
    }

    panCamera(dx: number, dy: number){
        // [Right click: Pan]
        // 🌟 Fix: Recalculate 'forward', 'right', 'up' vectors from current angle
        
        // 1. Forward vector
        const forward = vec3.fromValues(
            -Math.sin(this.phi) * Math.sin(this.theta),
            -Math.cos(this.phi),
            -Math.sin(this.phi) * Math.cos(this.theta)
        );
        
        // 2. World up direction (Y-axis)
        const worldUp = vec3.fromValues(0, 1, 0);
        
        // 3. Right vector (cross product of forward x up)
        const right = vec3.create();
        vec3.cross(right, forward, worldUp);
        vec3.normalize(right, right); // Normalize just in case
        
        // 4. Camera's true up vector (cross product of right x forward)
        const up = vec3.create();
        vec3.cross(up, right, forward);
        vec3.normalize(up, up);

        // 5. Move the target coordinates
        vec3.scaleAndAdd(this.target, this.target, right, dx);
        vec3.scaleAndAdd(this.target, this.target, up, dy);
    }



    private attachEvents() {
        // When the mouse is pressed
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.dragButton = e.button;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        // When the mouse is released (attached to window considering when it goes out of screen)
        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            this.dragButton = -1;
        });

        // When the mouse is moved
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const dx = e.clientX - this.lastMouseX;
            const dy = e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            if (this.dragButton === 0) { 
                this.rotateCamera(dx * 0.01, dy * 0.01);
            } 
            else if (this.dragButton === 2) { 
                const panSpeed = this.distance * 0.002;
                this.panCamera(-dx * panSpeed, dy * panSpeed);
            }
        });

        // When the wheel is turned
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            // [Wheel: Zoom]
            this.distance += e.deltaY * this.distance * 0.001;
            this.distance = Math.max(1.0, this.distance); // Prevent getting too close
        }, { passive: false });

        // --- Math Helpers ---

        function getDistance(touches: TouchList): number {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.hypot(dx, dy);
        }

        function getCenter(touches: TouchList): { x: number, y: number } {
            return {
                x: (touches[0].clientX + touches[1].clientX) / 2,
                y: (touches[0].clientY + touches[1].clientY) / 2
            };
        }

        // --- State Variables ---

        // 1-Finger Tracking (Rotate)
        let lastTouchX: number | null = null;
        let lastTouchY: number | null = null;

        // 2-Finger Tracking (Pan & Zoom)
        let lastPinchDistance: number | null = null;
        let lastCenter: { x: number, y: number } | null = null;

        // --- Sensitivity Configuration ---
        // Tweak these to match your WebGPU coordinate system
        const ROTATION_SENSITIVITY = 0.01; 
        const PAN_SENSITIVITY = 0.05; 

        // --- Event Listeners ---

        this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
            e.preventDefault(); // Prevent scrolling/zooming the page

            if (e.touches.length === 1) {
                // Setup 1-finger rotation
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
                
                // Clear 2-finger state just in case
                lastPinchDistance = null;
                lastCenter = null;
                
            } else if (e.touches.length === 2) {
                // Setup 2-finger zoom and pan
                lastPinchDistance = getDistance(e.touches);
                lastCenter = getCenter(e.touches);
                
                // Clear 1-finger state so rotation stops when a 2nd finger touches
                lastTouchX = null;
                lastTouchY = null;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
            e.preventDefault();

            // -----------------------------------------
            // 1-FINGER ROTATE
            // -----------------------------------------
            if (e.touches.length === 1 && lastTouchX !== null && lastTouchY !== null) {
                const currentX = e.touches[0].clientX;
                const currentY = e.touches[0].clientY;
                
                const deltaX = currentX - lastTouchX;
                const deltaY = currentY - lastTouchY;

                this.rotateCamera(deltaX * ROTATION_SENSITIVITY, deltaY * ROTATION_SENSITIVITY);
                
                // TODO: Apply rotation to your WebGPU camera.
                // Usually, deltaX rotates around the Y-axis (yaw)
                // and deltaY rotates around the X-axis (pitch).
                // camera.rotation.y -= deltaX * ROTATION_SENSITIVITY;
                // camera.rotation.x -= deltaY * ROTATION_SENSITIVITY;
                
                lastTouchX = currentX;
                lastTouchY = currentY;

            // -----------------------------------------
            // 2-FINGER ZOOM & PAN
            // -----------------------------------------
            } else if (e.touches.length === 2 && lastPinchDistance !== null && lastCenter !== null) {
                const currentDistance = getDistance(e.touches);
                const currentCenter = getCenter(e.touches);
                
                // --- ZOOM ---
                const zoomDelta = currentDistance / lastPinchDistance;
                // TODO: Apply zoomDelta to camera distance
                this.distance /= zoomDelta;
                
                // --- PAN ---
                const panDeltaX = - (currentCenter.x - lastCenter.x);
                const panDeltaY = currentCenter.y - lastCenter.y;
                this.panCamera(panDeltaX * PAN_SENSITIVITY, panDeltaY * PAN_SENSITIVITY);
                
                // TODO: Apply pan deltas to your WebGPU camera target/position.
                // Note: You may need to invert the axes depending on your coordinate system.
                // camera.target.x -= panDeltaX * PAN_SENSITIVITY;
                // camera.target.y += panDeltaY * PAN_SENSITIVITY;
                
                lastPinchDistance = currentDistance;
                lastCenter = currentCenter;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e: TouchEvent) => {
            e.preventDefault();
            
            if (e.touches.length === 0) {
                // All fingers lifted, clear everything
                lastTouchX = null;
                lastTouchY = null;
                lastPinchDistance = null;
                lastCenter = null;
                
            } else if (e.touches.length === 1) {
                // User lifted one finger, but kept one on screen.
                // We seamlessly transition back to 1-finger rotation.
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
                lastPinchDistance = null;
                lastCenter = null;
            }
        }, { passive: false });

        this.canvas.addEventListener('touchcancel', () => {
            lastTouchX = null;
            lastTouchY = null;
            lastPinchDistance = null;
            lastCenter = null;
        });
        
        // Disable browser menu on right click
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    // Calculate actual [x, y, z] camera coordinates from polar coordinates
    private getEyePosition(): [number,number,number] {
        const x = this.target[0] + this.distance * Math.sin(this.phi) * Math.sin(this.theta);
        const y = this.target[1] + this.distance * Math.cos(this.phi);
        const z = this.target[2] + this.distance * Math.sin(this.phi) * Math.cos(this.theta);
        return [x, y, z];
    }

    // Camera view matrix (from where to where it is looking)
    private getViewMatrix(): mat4 {
        const eye = this.getEyePosition();
        const view = mat4.create();
        mat4.lookAt(view, eye, this.target, [0, 1, 0]); // Up direction is always Y-axis
        return view;
    }

    // Called every frame, generates and returns two matrices to pass to GPU
    public getMatrices(aspectRatio: number) {
        const view = this.getViewMatrix();
        
        const proj = mat4.create();
        // FOV: 45 degrees (PI/4), Near clip: 0.1, Far clip: 1000.0
        mat4.perspective(proj, Math.PI / 4, aspectRatio, 0.1, 1000.0);

        const viewProj = mat4.create();
        mat4.multiply(viewProj, proj, view); // Projection matrix x View matrix

        return {
            view: Array.from(view),
            viewProjection: Array.from(viewProj)
        };
    }
}