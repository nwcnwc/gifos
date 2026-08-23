import {Shape, ShapeGeometry, MeshBasicMaterial, Mesh, Color, Object3D, DoubleSide} from "three";
import {CubeElement} from "./cubeData";

export const createSquare = (color: Color, element: CubeElement) => {
    const squareShape = new Shape();
    const x = 0, y = 0;
    squareShape.moveTo(x - 0.4, y + 0.5);
    squareShape.lineTo(x + 0.4, y + 0.5);
    squareShape.bezierCurveTo(x + 0.5, y + 0.5, x + 0.5, y + 0.5, x + 0.5, y + 0.4);
    squareShape.lineTo(x + 0.5, y - 0.4);
    squareShape.bezierCurveTo(x + 0.5, y - 0.5, x + 0.5, y - 0.5, x + 0.4, y - 0.5);
    squareShape.lineTo(x - 0.4, y - 0.5);
    squareShape.bezierCurveTo(x - 0.5, y - 0.5, x - 0.5, y - 0.5, x - 0.5, y - 0.4);
    squareShape.lineTo(x - 0.5, y + 0.4);
    squareShape.bezierCurveTo(x - 0.5, y + 0.5, x + 0.5, y + 0.5, x - 0.4, y + 0.5);

    const geometry = new ShapeGeometry(squareShape);
    const material = new MeshBasicMaterial({color});
    const mesh = new Mesh(geometry, material);
    mesh.scale.set(0.9, 0.9, 0.9);

    const square = new SquareMesh(element);
    square.add(mesh);

    const mat2 = new MeshBasicMaterial({
        color: "black",
        side: DoubleSide
    });
    const plane = new Mesh(geometry, mat2);
    plane.position.set(0, 0, -0.01);
    square.add(plane);

    square.position.set(element.pos.x, element.pos.y, element.pos.z);
    square.lookAt(element.pos.clone().add(element.normal));
    return square;
};

export class SquareMesh extends Object3D {
    public element: CubeElement;
    public constructor(element: CubeElement) {
        super();
        this.element = element;
    }
}
