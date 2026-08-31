# OpenJSCAD

Write a JavaScript program that returns a 3D solid, then orbit it. The last script comes back the next time you open the app.

## Run a design

1. Tap **Gear** or **Cube** for a starter, or type your own script.
2. Press **Run**. The solid fills the view.
3. Drag to orbit. Scroll or pinch to zoom. Right-drag (or Shift-drag) to pan. **Reset** puts the camera back.
4. If the script lists parameters, sliders appear under the buttons — move one and the solid rebuilds.

On a phone, **Model** and **Script** are two taps at the top. Run works on both. Back returns to the model.

## The language

A design is a `main()` function that returns a shape (or an array of shapes):

```
const { cuboid, sphere } = require('@jscad/modeling').primitives
const { subtract } = require('@jscad/modeling').booleans

const main = () => subtract(cuboid({ size: [20, 20, 20] }), sphere({ radius: 13 }))
module.exports = { main }
```

Unions, intersections, hulls, extrusions, and colours from `@jscad/modeling` all work. 2D shapes are extruded a hair so you can see them. A red note names a syntax error or a `main()` that returned nothing.

**STL** downloads the current mesh for a printer.

## A live friend

Press **Invite** in the bar above the app. A friend who opens the link sees this script and this solid. They can orbit; they cannot edit. Your typing is the source of truth.

## What is saved

The last script, its parameter values, and the display switches (wire / grid / spin) stay in this file on this device.

Unofficial port of [OpenJSCAD](https://github.com/jscad/OpenJSCAD.org) by the JSCAD Organization.
