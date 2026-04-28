// ── Shared configuration and solar math ─────────────────────
// Used by both the WebGL simulator (shader.js) and the
// analysis script (analysis/analyze.mjs).

// ── Location ───────────────────────────────────────────────
export const LAT = 47.6062;                    // Seattle, WA latitude (degrees N)
export const LON = -122.3321;                  // Seattle, WA longitude (degrees W)
export const DEG = Math.PI / 180;              // degrees-to-radians conversion factor

// ── Scene bounds (feet). X = east, Y = north. ──────────────
export const S_MIN = [-55, -55];
export const S_MAX = [ 55,  22];

// ── Yard dimensions centered at origin (15 ft wide × 27 ft long) ──
export const Y_MIN = [-7.5, -13.5];
export const Y_MAX = [ 7.5,  13.5];

// ── Building / object heights (feet) ───────────────────────
export const HOUSE_HEIGHT = 25;                // all surrounding houses
export const FENCE_HEIGHT = 6;                 // yard perimeter fence
export const FENCE_THICK  = 0.1;               // fence thickness
export const TABLE_HEIGHT = 4;                 // outdoor table
export const SEAT_HEIGHT  = 2;                 // bench seats

// ── Scene geometry: [minX, minY, minZ, maxX, maxY, maxZ] ──
export const BOXES = [
  [-44.5, -15.5, 0,  -7.5, 15.5, HOUSE_HEIGHT],   // 0: west house  37'×31'
  [  7.5, -15.5, 0,  45.5, 15.5, HOUSE_HEIGHT],   // 1: east house  38'×31'
  [-35,   -48.5, 0,  10,  -23.5, HOUSE_HEIGHT],   // 2: SW house    45'×25'
  [ 10,   -48.5, 0,  35,  -23.5, HOUSE_HEIGHT],   // 3: SE house    25'×25'
  [ -7.5, -14.0, 0,   7.5,-13.5, FENCE_HEIGHT],   // 4: fence south
  [ -7.5,  13.5, 0,   7.5, 14.0, FENCE_HEIGHT],   // 5: fence north
  [ -8.0, -13.5, 0,  -7.5, 13.5, FENCE_HEIGHT],   // 6: fence west
  [  7.5, -13.5, 0,   8.0, 13.5, FENCE_HEIGHT],   // 7: fence east
  [ -3.0,  -9.0, 0,   3.0, -7.0, TABLE_HEIGHT],   // 8: table 6'×2'
  [ -3.5, -10.0, 0,   3.5, -9.0, SEAT_HEIGHT],    // 9: seat south 7'×1'
  [ -3.5,  -7.0, 0,   3.5, -6.0, SEAT_HEIGHT],    // 10: seat north 7'×1'
];
export const N_BOXES = BOXES.length;

// ── Timezone offsets (US Pacific) ──────────────────────────
export const PST_OFFSET = -8;                  // Pacific Standard Time (UTC-8)
export const PDT_OFFSET = -7;                  // Pacific Daylight Time (UTC-7)

// ── Solar Position (NOAA-style) ────────────────────────────
export function utcOffset(yr, mo, dy) {
  // US Pacific: PST (Nov-Feb), PDT (Apr-Oct), transitions in Mar/Nov
  if (mo < 3 || mo > 11) return PST_OFFSET;
  if (mo > 3 && mo < 11) return PDT_OFFSET;
  if (mo === 3) {
    // DST starts 2nd Sunday of March
    const d = new Date(yr, 2, 1).getDay();
    const s2 = (d === 0 ? 8 : 8 + 7 - d);
    return dy >= s2 ? PDT_OFFSET : PST_OFFSET;
  }
  // mo === 11: DST ends 1st Sunday of November
  const d = new Date(yr, 10, 1).getDay();
  const s1 = d === 0 ? 1 : 8 - d;
  return dy >= s1 ? PST_OFFSET : PDT_OFFSET;
}

export function julianDay(yr, mo, dy, utcH) {
  if (mo <= 2) { yr--; mo += 12; }
  const A = Math.floor(yr / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (mo + 1))
       + dy + utcH / 24.0 + B - 1524.5;
}

export function sunPos(yr, mo, dy, lH, lM) {
  const off = utcOffset(yr, mo, dy);
  const utcH = lH + lM / 60 - off;
  const JD = julianDay(yr, mo, dy, utcH);
  const T = (JD - 2451545.0) / 36525.0;   // Julian centuries since J2000.0 epoch

  // NOAA solar position formulas — coefficients are standard astronomical constants
  let L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;  // mean longitude (deg)
  if (L0 < 0) L0 += 360;
  let M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360;   // mean anomaly (deg)
  if (M < 0) M += 360;
  const Mr = M * DEG;
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);     // orbital eccentricity
  const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mr)
          + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
          + 0.000289 * Math.sin(3 * Mr);                             // equation of center (deg)
  const stl = L0 + C;                                                // sun true longitude (deg)
  const omega = 125.04 - 1934.136 * T;                               // ascending node longitude (deg)
  const lam = (stl - 0.00569 - 0.00478 * Math.sin(omega * DEG)) * DEG; // apparent longitude (rad)

  // Obliquity of the ecliptic
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega * DEG)) * DEG;        // corrected obliquity (rad)

  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));              // solar declination (rad)

  // Equation of time (minutes)
  const y2 = Math.tan(eps / 2) ** 2;
  const L0r = L0 * DEG;
  const MIN_PER_DEG = 4;               // 1 degree of rotation = 4 minutes of time
  const eqT = MIN_PER_DEG / DEG * (
    y2 * Math.sin(2 * L0r)
    - 2 * e * Math.sin(Mr)
    + 4 * e * y2 * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y2 * y2 * Math.sin(4 * L0r)
    - 1.25 * e * e * Math.sin(2 * Mr)
  );

  // Hour angle from solar noon
  const solarMin = utcH * 60 + eqT + MIN_PER_DEG * LON;
  const ha = (solarMin / MIN_PER_DEG - 180) * DEG;                   // hour angle (rad)
  const latR = LAT * DEG;

  const sinAlt = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(sinAlt);

  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(latR))
              / (Math.cos(alt) * Math.cos(latR));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (ha > 0) az = 2 * Math.PI - az;

  return { alt, az };
}

export function sunDir(alt, az) {
  const ca = Math.cos(alt);
  return [ca * Math.sin(az), ca * Math.cos(az), Math.sin(alt)];
}

// ── Analytical ray-AABB intersection (slab method) ─────────
// Same algorithm as the GLSL rayHitsBox in fragment.glsl.
// Tests if ray from origin o=[x,y,z] in direction d=[dx,dy,dz]
// intersects the axis-aligned box [mn, mx] at t > 0.
export function rayHitsBox(o, d, mn, mx) {
  let tEnter = -Infinity;
  let tExit  =  Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      // Ray is parallel to this slab — miss if origin outside
      if (o[i] < mn[i] || o[i] > mx[i]) return false;
    } else {
      const invD = 1.0 / d[i];
      let t1 = (mn[i] - o[i]) * invD;
      let t2 = (mx[i] - o[i]) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tEnter) tEnter = t1;
      if (t2 < tExit)  tExit  = t2;
      if (tExit < tEnter) return false;
    }
  }
  return tExit > 0.0;
}

// ── Shadow test ────────────────────────────────────────────
// Returns true if the ground point [x, y, startZ] is in shadow.
export function inShadow(x, y, startZ, sunDirVec) {
  const o = [x, y, startZ];
  for (let i = 0; i < N_BOXES; i++) {
    const mn = [BOXES[i][0], BOXES[i][1], BOXES[i][2]];
    const mx = [BOXES[i][3], BOXES[i][4], BOXES[i][5]];
    if (rayHitsBox(o, sunDirVec, mn, mx)) return true;
  }
  return false;
}

// ── Solar noon ─────────────────────────────────────────────
// Returns { hour, minute } of solar noon in local clock time.
// Solar noon is when the hour angle = 0 (sun due south).
export function solarNoon(yr, mo, dy) {
  const off = utcOffset(yr, mo, dy);
  // Approximate: compute equation of time at ~12:00 local
  const utcH = 12 - off;
  const JD = julianDay(yr, mo, dy, utcH);
  const T = (JD - 2451545.0) / 36525.0;

  let L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  if (L0 < 0) L0 += 360;
  let M = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360;
  if (M < 0) M += 360;
  const Mr = M * DEG;
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const omega = 125.04 - 1934.136 * T;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega * DEG)) * DEG;
  const y2 = Math.tan(eps / 2) ** 2;
  const L0r = L0 * DEG;
  const MIN_PER_DEG = 4;
  const eqT = MIN_PER_DEG / DEG * (
    y2 * Math.sin(2 * L0r)
    - 2 * e * Math.sin(Mr)
    + 4 * e * y2 * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y2 * y2 * Math.sin(4 * L0r)
    - 1.25 * e * e * Math.sin(2 * Mr)
  );

  // Solar noon in local minutes = 720 - 4*LON - eqT + offset*60
  const noonMin = 720 - MIN_PER_DEG * LON - eqT + off * 60;
  const h = Math.floor(noonMin / 60);
  const m = Math.round(noonMin % 60);
  return { hour: h, minute: m };
}
