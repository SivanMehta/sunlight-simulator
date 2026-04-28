# ☀️ Yard Sunlight Simulator

A WebGL 2 simulation that visualizes shadows cast across a residential yard throughout the day. Renders accurate solar positions and real-time shadow mapping using ray marching in a fragment shader.

![screenshot](reference/screenshot.png)

## Running

The app loads GLSL shaders via `fetch()`, so it must be served over HTTP (not `file://`).

```bash
npm start
# or
python3 -m http.server
```

Then open [http://localhost:3000](http://localhost:3000) (or whichever port your server reports).

## Controls

| Control | Input | Effect |
|---------|-------|--------|
| **Date** | Date picker | Sets the calendar date for solar position calculation |
| **Time** | Range slider (5 AM – 9 PM) | Moves the sun to the selected time of day |
| **Arrow keys** | ← / → | Nudges time ±15 minutes |

The time slider defaults to the current time of day on page load. Sun altitude and azimuth are displayed below the controls.

## Architecture

```
index.html        Minimal HTML shell — controls, canvas, compass labels
styles.css        Dark theme styling
shader.js         All JavaScript: solar math, WebGL setup, render loop, UI
vertex.glsl       Passthrough vertex shader (clip-space → UV)
fragment.glsl     Core rendering: ray marching, bounce lighting, coloring
```

**Solar position** is computed using NOAA-style astronomical formulas (Julian day → solar declination → hour angle → altitude/azimuth), with automatic PST/PDT timezone handling.

**Scene geometry** is defined as axis-aligned boxes passed to the shader as uniforms:

| Index | Object | Height |
|-------|--------|--------|
| 0–3 | Surrounding houses | 25 ft |
| 4–7 | Yard perimeter fence | 6 ft |
| 8 | Outdoor table | 3 ft |

Coordinate system: **X = East, Y = North, Z = Up**. The 15 ft × 27 ft yard is centered at the origin.

## Rendering Techniques

### Ray Marching (Shadow Casting)

For each ground pixel, a ray is cast from the surface toward the sun direction. The shader uses a two-phase march:

1. **Fine pass** — 120 steps at 0.25 ft to detect thin geometry (the 0.5 ft fence)
2. **Coarse pass** — 80 steps at 1.0 ft to reach distant buildings

If a ray intersects any box, the pixel is shaded as shadow. An early-exit at `z > 25 ft` (max building height) avoids unnecessary iterations.

### Single-Bounce Indirect Lighting

The surrounding houses have white-painted walls (reflectivity 0.80). The shader estimates indirect illumination by checking all four vertical faces of each house:

- Compute solar irradiance on the wall face (`dot(sun, normal)`)
- Calculate a distance-based form factor from the wall to the ground point
- Accumulate the reflected contribution, scaled by `BOUNCE_SCALE`

This produces subtle fill light in areas adjacent to sun-lit walls, even when the ground point itself is in shadow.

### Daylight & Horizon

A `smoothstep` fade between sun altitudes of −0.02 and 0.18 radians simulates twilight transitions. Below the horizon, the scene dims to 10% brightness.

### Outlines

Building and fence edges are rendered with a signed-distance outline (1.8 px wide, blended at 45% opacity) for visual clarity in the top-down view.
