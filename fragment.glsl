#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fc;

uniform vec2 u_sMin, u_sMax, u_yMin, u_yMax;
uniform vec3 u_sun;
uniform float u_alt, u_px;

const int N = N_BOXES;                  // total scene boxes (4 houses + 4 fences + 1 table + 2 seats)
uniform vec3 u_bMin[N], u_bMax[N];

const float RAY_START_Z    = 0.01;      // ground clearance to avoid self-intersection

// ── Visual tuning ────────────────────────────────────────────
const int   FIRST_WOOD_IDX = 4;         // box indices >= this are wood (fences/table)
const vec3  WOOD_COLOR     = vec3(0.55, 0.40, 0.25);   // fence & table color
const vec3  ROOF_COLOR     = vec3(0.40, 0.40, 0.45);   // building top-down color
const vec3  YARD_COLOR     = vec3(0.42, 0.68, 0.28);   // grass / yard fill
const vec3  GROUND_COLOR   = vec3(0.72, 0.70, 0.65);   // concrete / surrounding ground

const float SHADOW_DIM     = 0.30;      // brightness multiplier in shadow
const vec3  SHADOW_TINT    = vec3(0.01, 0.01, 0.04);   // cool ambient added in shadow
const float NIGHT_DIM      = 0.10;      // brightness when sun is below horizon

const float HORIZON_LO     = -0.02;     // sun altitude (rad) where twilight begins
const float HORIZON_HI     = 0.18;      // sun altitude (rad) where full daylight reached
const float MIN_DAYLIGHT   = 0.12;      // minimum brightness factor at night

const float OUTLINE_WIDTH  = 1.8;       // building outline thickness (in pixels)
const vec3  OUTLINE_COLOR  = vec3(0.55, 0.55, 0.58);
const float OUTLINE_ALPHA  = 0.45;      // outline blend strength

const float MIN_DIST2      = 0.01;      // minimum squared distance to avoid divide-by-zero

bool inBox2D(vec2 p, vec3 mn, vec3 mx) {
  return p.x >= mn.x && p.x <= mx.x && p.y >= mn.y && p.y <= mx.y;
}

// Analytical ray-AABB intersection (slab method)
// Returns true if ray from origin o in direction d hits the box [mn, mx] at t > 0
bool rayHitsBox(vec3 o, vec3 d, vec3 mn, vec3 mx) {
  vec3 invD = 1.0 / d;
  vec3 t1 = (mn - o) * invD;
  vec3 t2 = (mx - o) * invD;
  vec3 tMin = min(t1, t2);
  vec3 tMax = max(t1, t2);
  float tEnter = max(max(tMin.x, tMin.y), tMin.z);
  float tExit  = min(min(tMax.x, tMax.y), tMax.z);
  return tExit >= tEnter && tExit > 0.0;
}

// Test if a point is in shadow by checking all boxes analytically
bool inShadow(vec3 o, vec3 d) {
  for (int i = 0; i < N; i++) {
    if (rayHitsBox(o, d, u_bMin[i], u_bMax[i])) return true;
  }
  return false;
}

// ── Bounce lighting parameters ────────────────────────────────
const float PAINT_REFL   = 0.80;        // outdoor white paint reflectivity
const float BOUNCE_SCALE = 0.10;        // overall indirect light intensity
const int   N_HOUSES     = 4;           // only first 4 boxes are houses with white walls
const float TWO_PI       = 6.2832;      // 2π for form factor denominator

float wallBounce(vec2 gp, vec3 sun) {
  float total = 0.0;
  for (int i = 0; i < N_HOUSES; i++) {
    vec3 mn = u_bMin[i];
    vec3 mx = u_bMax[i];
    float h = mx.z;

    // Check 4 vertical faces: +X, -X, +Y, -Y
    // Face normals and edge distances
    // East face (+X): at mx.x, normal = (1,0,0), spans [mn.y..mx.y]
    // West face (-X): at mn.x, normal = (-1,0,0), spans [mn.y..mx.y]
    // North face (+Y): at mx.y, normal = (0,1,0), spans [mn.x..mx.x]
    // South face (-Y): at mn.y, normal = (0,-1,0), spans [mn.x..mx.x]

    // East face
    {
      vec3 n = vec3(1, 0, 0);
      float irr = max(0.0, dot(sun, n));
      if (irr > 0.0) {
        float cy = clamp(gp.y, mn.y, mx.y);
        float dx = gp.x - mx.x;
        float dy = gp.y - cy;
        float dist2 = dx * dx + dy * dy;
        if (dx > 0.0 && dist2 > MIN_DIST2) {
          float ff = h / (TWO_PI * dist2 + 1.0);
          total += irr * PAINT_REFL * ff;
        }
      }
    }
    // West face
    {
      vec3 n = vec3(-1, 0, 0);
      float irr = max(0.0, dot(sun, n));
      if (irr > 0.0) {
        float cy = clamp(gp.y, mn.y, mx.y);
        float dx = mn.x - gp.x;
        float dy = gp.y - cy;
        float dist2 = dx * dx + dy * dy;
        if (dx > 0.0 && dist2 > MIN_DIST2) {
          float ff = h / (TWO_PI * dist2 + 1.0);
          total += irr * PAINT_REFL * ff;
        }
      }
    }
    // North face
    {
      vec3 n = vec3(0, 1, 0);
      float irr = max(0.0, dot(sun, n));
      if (irr > 0.0) {
        float cx = clamp(gp.x, mn.x, mx.x);
        float dx = gp.x - cx;
        float dy = gp.y - mx.y;
        float dist2 = dx * dx + dy * dy;
        if (dy > 0.0 && dist2 > MIN_DIST2) {
          float ff = h / (TWO_PI * dist2 + 1.0);
          total += irr * PAINT_REFL * ff;
        }
      }
    }
    // South face
    {
      vec3 n = vec3(0, -1, 0);
      float irr = max(0.0, dot(sun, n));
      if (irr > 0.0) {
        float cx = clamp(gp.x, mn.x, mx.x);
        float dx = gp.x - cx;
        float dy = mn.y - gp.y;
        float dist2 = dx * dx + dy * dy;
        if (dy > 0.0 && dist2 > MIN_DIST2) {
          float ff = h / (TWO_PI * dist2 + 1.0);
          total += irr * PAINT_REFL * ff;
        }
      }
    }
  }
  return total * BOUNCE_SCALE;
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
    c = bi >= FIRST_WOOD_IDX ? WOOD_COLOR : ROOF_COLOR;
  } else if (isY) {
    c = YARD_COLOR;
  } else {
    c = GROUND_COLOR;
  }

  // Shadow via ray marching (ground, yard, and wood objects like fences/table)
  bool isWood = isB && bi >= FIRST_WOOD_IDX;
  if (!isB || isWood) {
    if (u_alt > 0.0) {
      // Start ray above the object surface to avoid self-intersection
      float startZ = isWood ? u_bMax[bi].z + RAY_START_Z : RAY_START_Z;
      float bounce = wallBounce(w, u_sun);
      if (inShadow(vec3(w, startZ), u_sun)) {
        c *= SHADOW_DIM;
        c += SHADOW_TINT;
      }
      c += vec3(bounce);
    } else {
      c *= NIGHT_DIM;
    }
  }

  // Daylight fade near horizon
  float dl = smoothstep(HORIZON_LO, HORIZON_HI, u_alt);
  c *= mix(MIN_DAYLIGHT, 1.0, dl);

  // Building/fence outlines
  for (int i = 0; i < N; i++) {
    float bd = max(max(u_bMin[i].x - w.x, w.x - u_bMax[i].x), max(u_bMin[i].y - w.y, w.y - u_bMax[i].y));
    float bo = 1.0 - smoothstep(0.0, u_px * OUTLINE_WIDTH, abs(bd));
    c = mix(c, OUTLINE_COLOR, bo * OUTLINE_ALPHA);
  }

  fc = vec4(c, 1);
}
