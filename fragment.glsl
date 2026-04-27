#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fc;

uniform vec2 u_sMin, u_sMax, u_yMin, u_yMax;
uniform vec3 u_sun;
uniform float u_alt, u_px;

const int N = 8;
uniform vec3 u_bMin[N], u_bMax[N];

bool inBox2D(vec2 p, vec3 mn, vec3 mx) {
  return p.x >= mn.x && p.x <= mx.x && p.y >= mn.y && p.y <= mx.y;
}

// Ray march from ground point toward sun, checking building intersections
bool rayMarch(vec3 o, vec3 d) {
  float t = 0.0;
  // Fine steps (0.25 ft) to catch thin fence (0.5 ft thick)
  for (int i = 0; i < 120; i++) {
    t += 0.25;
    vec3 p = o + t * d;
    if (p.z > 25.0) return false;
    for (int j = 0; j < N; j++) {
      if (all(greaterThanEqual(p, u_bMin[j])) && all(lessThanEqual(p, u_bMax[j])))
        return true;
    }
  }
  // Coarse steps (1 ft) for distant buildings
  for (int i = 0; i < 80; i++) {
    t += 1.0;
    vec3 p = o + t * d;
    if (p.z > 25.0) return false;
    for (int j = 0; j < N; j++) {
      if (all(greaterThanEqual(p, u_bMin[j])) && all(lessThanEqual(p, u_bMax[j])))
        return true;
    }
  }
  return false;
}

void main() {
  vec2 w = mix(u_sMin, u_sMax, v_uv);

  // Identify region
  bool isB = false; int bi = -1;
  for (int i = 0; i < N; i++) {
    if (inBox2D(w, u_bMin[i], u_bMax[i])) { isB = true; bi = i; break; }
  }
  bool isY = w.x >= u_yMin.x && w.x <= u_yMax.x && w.y >= u_yMin.y && w.y <= u_yMax.y;

  // Base colour
  vec3 c;
  if (isB) {
    c = bi >= 4 ? vec3(0.55, 0.40, 0.25) : vec3(0.40, 0.40, 0.45);
  } else if (isY) {
    c = vec3(0.42, 0.68, 0.28);
  } else {
    c = vec3(0.72, 0.70, 0.65);
  }

  // Shadow via ray marching
  if (!isB) {
    if (u_alt > 0.0) {
      if (rayMarch(vec3(w, 0.01), u_sun)) {
        c *= 0.30;
        c += vec3(0.01, 0.01, 0.04);
      }
    } else {
      c *= 0.10;
    }
  }

  // Daylight fade near horizon
  float dl = smoothstep(-0.02, 0.18, u_alt);
  c *= mix(0.12, 1.0, dl);

  // Building/fence outlines
  for (int i = 0; i < N; i++) {
    float bd = max(max(u_bMin[i].x - w.x, w.x - u_bMax[i].x), max(u_bMin[i].y - w.y, w.y - u_bMax[i].y));
    float bo = 1.0 - smoothstep(0.0, u_px * 1.8, abs(bd));
    c = mix(c, vec3(0.55, 0.55, 0.58), bo * 0.45);
  }

  fc = vec4(c, 1);
}
