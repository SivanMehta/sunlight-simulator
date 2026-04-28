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
index.html          Minimal HTML shell — controls, canvas, compass labels
styles.css          Dark theme styling
shared.js           Shared ES module: solar math, geometry, ray-box intersection
shader.js           WebGL setup, render loop, UI (imports shared.js)
vertex.glsl         Passthrough vertex shader (clip-space → UV)
fragment.glsl       Core rendering: shadow casting, bounce lighting, coloring
analysis/
  analyze.mjs       Node.js script — yearly sunlight data → CSV
  chart.html        Chart.js visualization of the CSV data
  sunlight-2026.csv Generated output
```

**Solar position** is computed using NOAA-style astronomical formulas (Julian day → solar declination → hour angle → altitude/azimuth), with automatic PST/PDT timezone handling.

**Scene geometry** is defined as axis-aligned boxes passed to the shader as uniforms:

| Index | Object | Height |
|-------|--------|--------|
| 0–3 | Surrounding houses | 25 ft |
| 4–7 | Yard perimeter fence | 6 ft |
| 8 | Outdoor table | 4 ft |
| 9–10 | Bench seats | 2 ft |

Coordinate system: **X = East, Y = North, Z = Up**. The 15 ft × 27 ft yard is centered at the origin.

## Rendering Techniques

### Analytical Ray-Box Intersection (Shadow Casting)

For each ground pixel, a ray is cast from the surface toward the sun direction and tested against all scene boxes using the **slab method** (analytical ray-AABB intersection). This produces mathematically exact shadow edges with no aliasing artifacts.

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

## Yearly Sunlight Analysis

The `analysis/` directory contains a Node.js script that computes the percentage of the yard in direct sunlight at **solar noon** for every day of a given year.

```bash
node analysis/analyze.mjs 2026    # generates analysis/sunlight-2026.csv
```

The script uses the same solar math and ray-box intersection as the WebGL simulator, but runs headlessly on a 60×60 sample grid across the yard. It evaluates at true solar noon (when the sun is highest) rather than 12:00 PM clock time, avoiding artifacts from DST transitions.

Open `analysis/chart.html` (served over HTTP) to see an interactive Chart.js line chart of the results. The chart shows a clear seasonal pattern for Seattle:

- **Winter (Nov–Jan):** ~0% — low sun angle means surrounding 25 ft houses fully shadow the yard
- **Spring (Mar–Apr):** 10–30% — sun climbs above the rooflines
- **Summer (May–Jun):** ~40% peak — highest sun altitude (~62° at solstice)
- **Fall (Sep–Oct):** drops back to 0% as shadows lengthen
