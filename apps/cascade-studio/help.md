# CascadeStudio

Sketch a closed profile, then pull it into a solid. The part is a real CAD solid — the same kind of kernel FreeCAD uses — not a pile of triangles that only look like one.

## Draw

The left pane is the sketch plane.

- **Tap** (or click) to drop a point. The first point is green.
- **Drag** a point to move it.
- **Close** joins the last point back to the first. You need at least three points.
- **Undo** drops the last point, or opens a closed loop. The phone’s Back button does the same.
- **Clear** wipes the plane.

A light grid is 5 millimetres. Coordinates are millimetres on the XY plane.

## Pull it into a solid

- **Height** is how far the profile is pulled along Z.
- **Corner** rounds every vertex of the sketch before it is pulled. Zero is a sharp corner.

The solid rebuilds as you change it. Orbit the 3D view: drag to turn, scroll or pinch to zoom. Up is Z.

## Sample plate

**Sample plate** loads a 40 × 24 millimetre bracket with 6 millimetre corners, pulled 12 millimetres. Use it to confirm the kernel is awake, then draw your own.

If a corner is bigger than the edges around it, the solid may fail — drop Corner a little and it will rebuild.

## What is saved

The last sketch, its corner radius, and its height. Close the app and they are still there. Anyone who opens a copy of this file gets that same part.

A friend who opens your Invite lands on the same sketch. Either of you can move a point; both of you see the solid.

An unofficial port of Cascade Studio by Johnathon Selstad.
