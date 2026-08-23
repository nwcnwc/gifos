import {PerspectiveCamera, Raycaster, Scene, Vector2, Vector3, WebGLRenderer} from "three";
import {Cube} from "./cube";
import {rotateAroundWorldAxis} from "../util/transform";
import {SquareMesh} from "./square";
import {setFinish} from "./statusbar";

abstract class Control {
    protected renderer: WebGLRenderer;
    protected scene: Scene;
    protected cube: Cube;
    protected camera: PerspectiveCamera;
    protected _square: SquareMesh | null = null;
    private start = false;
    private lastOperateUnfinish = false;
    private startPos: Vector2 = new Vector2();
    protected get domElement() {
        return this.renderer.domElement;
    }
    private raycaster = new Raycaster();
    public constructor(camera: PerspectiveCamera, scene: Scene, renderer: WebGLRenderer, cube: Cube) {
        this.cube = cube;
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
    }

    protected getIntersects(offsetX: number, offsetY: number) {
        const x = (offsetX / this.domElement.clientWidth) * 2 - 1;
        const y = -(offsetY / this.domElement.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera({x, y}, this.camera);

        const intersectSquares: {distance: number; square: SquareMesh}[] = [];
        for (let i = 0; i < this.cube.squares.length; i++) {
            const intersects = this.raycaster.intersectObjects([this.cube.squares[i]]);
            if (intersects.length > 0) {
                intersectSquares.push({
                    distance: intersects[0].distance,
                    square: this.cube.squares[i]
                });
            }
        }
        intersectSquares.sort((a, b) => a.distance - b.distance);
        return intersectSquares.length > 0 ? intersectSquares[0] : null;
    }
    public abstract dispose(): void;
    protected operateStart(offsetX: number, offsetY: number) {
        if (this.start) return;
        this.start = true;
        this.startPos = new Vector2();
        const intersect = this.getIntersects(offsetX, offsetY);
        this._square = null;
        if (intersect) {
            this._square = intersect.square;
            this.startPos = new Vector2(offsetX, offsetY);
        }
    }

    protected operateDrag(offsetX: number, offsetY: number, movementX: number, movementY: number) {
        if (this.start && this.lastOperateUnfinish === false) {
            if (this._square) {
                const curMousePos = new Vector2(offsetX, offsetY);
                this.cube.rotateOnePlane(this.startPos, curMousePos, this._square, this.camera, {w: this.domElement.clientWidth, h: this.domElement.clientHeight});
            } else {
                const dx = movementX;
                const dy = -movementY;
                const movementLen = Math.sqrt(dx * dx + dy * dy);
                const cubeSize = this.cube.getCoarseCubeSize(this.camera, {
                    w: this.domElement.clientWidth,
                    h: this.domElement.clientHeight
                });
                const rotateAngle = Math.PI * movementLen / cubeSize;
                const moveVect = new Vector2(dx, dy);
                const rotateDir = moveVect.rotateAround(new Vector2(0, 0), Math.PI * 0.5);
                rotateAroundWorldAxis(this.cube, new Vector3(rotateDir.x, rotateDir.y, 0), rotateAngle);
            }
            this.renderer.render(this.scene, this.camera);
        }
    }

    protected operateEnd() {
        if (this.lastOperateUnfinish === false) {
            if (this._square) {
                const rotateAnimation = this.cube.getAfterRotateAnimation();
                this.lastOperateUnfinish = true;
                const animation = (time: number) => {
                    const next = rotateAnimation(time);
                    this.renderer.render(this.scene, this.camera);
                    if (next) {
                        requestAnimationFrame(animation);
                    } else {
                        setFinish(this.cube.finish);
                        this.lastOperateUnfinish = false;
                    }
                };
                requestAnimationFrame(animation);
            }
            this.start = false;
            this._square = null;
        }
    }
}

// One pointer-event controller replaces upstream's mouse + touch pair.
// Coordinates are canvas-local (getBoundingClientRect), capture stays on the
// canvas so a drag that leaves it still finishes, and touch-action:none lives
// only on this element — the chrome around the cube can still pan.
export class PointerControl extends Control {
    private lastX = 0;
    private lastY = 0;
    private pointerId: number | null = null;

    constructor(camera: PerspectiveCamera, scene: Scene, renderer: WebGLRenderer, cube: Cube) {
        super(camera, scene, renderer, cube);
        this.onDown = this.onDown.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onUp = this.onUp.bind(this);
        this.init();
    }

    private local(ev: PointerEvent) {
        const r = this.domElement.getBoundingClientRect();
        return {x: ev.clientX - r.left, y: ev.clientY - r.top};
    }

    public onDown(ev: PointerEvent) {
        if (this.pointerId !== null) return;
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        ev.preventDefault();
        this.pointerId = ev.pointerId;
        try { this.domElement.setPointerCapture(ev.pointerId); } catch (e) {}
        const p = this.local(ev);
        this.lastX = p.x;
        this.lastY = p.y;
        this.operateStart(p.x, p.y);
    }

    public onMove(ev: PointerEvent) {
        if (ev.pointerId !== this.pointerId) return;
        const p = this.local(ev);
        this.operateDrag(p.x, p.y, p.x - this.lastX, p.y - this.lastY);
        this.lastX = p.x;
        this.lastY = p.y;
    }

    public onUp(ev: PointerEvent) {
        if (this.pointerId !== null && ev.pointerId !== this.pointerId) return;
        if (this.pointerId === null) return;
        this.pointerId = null;
        try { this.domElement.releasePointerCapture(ev.pointerId); } catch (e) {}
        this.operateEnd();
    }

    public init(): void {
        const el = this.domElement;
        el.style.touchAction = "none";
        el.style.userSelect = "none";
        el.addEventListener("pointerdown", this.onDown, {passive: false} as AddEventListenerOptions);
        el.addEventListener("pointermove", this.onMove);
        el.addEventListener("pointerup", this.onUp);
        el.addEventListener("pointercancel", this.onUp);
    }
    public dispose(): void {
        const el = this.domElement;
        el.removeEventListener("pointerdown", this.onDown);
        el.removeEventListener("pointermove", this.onMove);
        el.removeEventListener("pointerup", this.onUp);
        el.removeEventListener("pointercancel", this.onUp);
    }
}

export default Control;
