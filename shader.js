// ── Configuration ──────────────────────────────────────────
const LAT = 47.6062;                    // Seattle, WA latitude (degrees N)
const LON = -122.3321;                  // Seattle, WA longitude (degrees W)
const DEG = Math.PI / 180;             // degrees-to-radians conversion factor

// Scene rendering bounds (feet). X = east, Y = north.
const S_MIN = [-55, -55];
const S_MAX = [ 55,  22];

// Yard dimensions centered at origin (15 ft wide × 27 ft long)
const Y_MIN = [-7.5, -13.5];
const Y_MAX = [ 7.5,  13.5];

// Buildings: [minX, minY, minZ, maxX, maxY, maxZ]  (feet)
const HOUSE_HEIGHT = 25;                // all surrounding houses are 25 ft tall
const FENCE_HEIGHT = 6;                 // yard perimeter fence height (ft)
const FENCE_THICK  = 0.1;              // fence thickness (ft)
const TABLE_HEIGHT = 4;                 // outdoor table height (ft)
const SEAT_HEIGHT = 2;                  // bench seat height (ft)
const BOXES = [
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
const N_BOXES = BOXES.length;

// ── UI constants ───────────────────────────────────────────
const CANVAS_WIDTH   = 800;             // canvas width in pixels
const SLIDER_MIN     = 300;             // 5:00 AM in minutes from midnight
const SLIDER_MAX     = 1260;            // 9:00 PM in minutes from midnight
const ARROW_KEY_STEP = 15;              // minutes per arrow key press

// ── Timezone offsets (US Pacific) ──────────────────────────
const PST_OFFSET = -8;                  // Pacific Standard Time (UTC-8)
const PDT_OFFSET = -7;                  // Pacific Daylight Time (UTC-7)

// ── Solar Position (NOAA-style) ────────────────────────────
function utcOffset(yr, mo, dy) {
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

function julianDay(yr, mo, dy, utcH) {
  if (mo <= 2) { yr--; mo += 12; }
  const A = Math.floor(yr / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (yr + 4716)) + Math.floor(30.6001 * (mo + 1))
       + dy + utcH / 24.0 + B - 1524.5;
}

function sunPos(yr, mo, dy, lH, lM) {
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

function sunDir(alt, az) {
  const ca = Math.cos(alt);
  return [ca * Math.sin(az), ca * Math.cos(az), Math.sin(alt)];
}

// ── Shader helpers ─────────────────────────────────────────
async function loadShader(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.text();
}

function injectShaderConstants(src, constants) {
  const defines = Object.entries(constants)
    .map(([name, value]) => `#define ${name} ${value}`)
    .join('\n');
  return src.replace(/^#version 300 es\s*\n/, match => `${match}${defines}\n`);
}

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  const canvas = document.getElementById('c');
  const sceneW = S_MAX[0] - S_MIN[0];
  const sceneH = S_MAX[1] - S_MIN[1];
  const CW = CANVAS_WIDTH, CH = Math.round(CW * sceneH / sceneW);
  canvas.width = CW; canvas.height = CH;
  canvas.style.width = CW + 'px'; canvas.style.height = CH + 'px';

  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) {
    document.body.innerHTML = '<h2 style="color:red">WebGL 2 not supported</h2>';
    return;
  }

  // Load and compile shaders
  const [vsSrc, fsSrc] = await Promise.all([
    loadShader('vertex.glsl'),
    loadShader('fragment.glsl'),
  ]);
  const fsConfigured = injectShaderConstants(fsSrc, { N_BOXES });

  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsConfigured);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // Full-screen quad
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  // Uniform locations
  const u = {};
  ['u_sMin','u_sMax','u_yMin','u_yMax','u_sun','u_alt','u_px'].forEach(
    n => u[n] = gl.getUniformLocation(prog, n)
  );
  const uBMin = [], uBMax = [];
  for (let i = 0; i < N_BOXES; i++) {
    uBMin.push(gl.getUniformLocation(prog, `u_bMin[${i}]`));
    uBMax.push(gl.getUniformLocation(prog, `u_bMax[${i}]`));
  }

  // Static uniforms
  gl.uniform2f(u.u_sMin, S_MIN[0], S_MIN[1]);
  gl.uniform2f(u.u_sMax, S_MAX[0], S_MAX[1]);
  gl.uniform2f(u.u_yMin, Y_MIN[0], Y_MIN[1]);
  gl.uniform2f(u.u_yMax, Y_MAX[0], Y_MAX[1]);
  gl.uniform1f(u.u_px, sceneW / CW);
  for (let i = 0; i < N_BOXES; i++) {
    gl.uniform3f(uBMin[i], BOXES[i][0], BOXES[i][1], BOXES[i][2]);
    gl.uniform3f(uBMax[i], BOXES[i][3], BOXES[i][4], BOXES[i][5]);
  }

  // ── Render ───────────────────────────────────────────────
  const dateIn  = document.getElementById('dateInput');
  const timeIn  = document.getElementById('timeSlider');
  const timeDisp = document.getElementById('timeDisplay');
  const altDisp  = document.getElementById('altVal');
  const azDisp   = document.getElementById('azVal');
  const sunNote  = document.getElementById('sunNote');

  function render() {
    const parts = dateIn.value.split('-');
    const yr = +parts[0], mo = +parts[1], dy = +parts[2];
    const totalMin = +timeIn.value;
    const lH = Math.floor(totalMin / 60), lM = totalMin % 60;

    const hr12 = lH % 12 || 12;            // convert 24h to 12h format
    const ampm = lH < 12 ? 'AM' : 'PM';
    timeDisp.textContent = `${hr12}:${String(lM).padStart(2,'0')} ${ampm}`;

    const { alt, az } = sunPos(yr, mo, dy, lH, lM);
    const dir = sunDir(alt, az);
    altDisp.textContent = (alt / DEG).toFixed(1);
    azDisp.textContent  = (az / DEG).toFixed(1);
    sunNote.textContent = alt <= 0 ? '(below horizon)' : '';

    gl.uniform3f(u.u_sun, dir[0], dir[1], dir[2]);
    gl.uniform1f(u.u_alt, alt);

    gl.viewport(0, 0, CW, CH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ── Controls ─────────────────────────────────────────────
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  dateIn.value = todayStr;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  timeIn.value = Math.max(+timeIn.min, Math.min(+timeIn.max, nowMin));

  dateIn.addEventListener('input', render);
  timeIn.addEventListener('input', render);

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'date') return;
    if (e.key === 'ArrowLeft')  { timeIn.value = Math.max(SLIDER_MIN, +timeIn.value - ARROW_KEY_STEP); render(); }
    if (e.key === 'ArrowRight') { timeIn.value = Math.min(SLIDER_MAX, +timeIn.value + ARROW_KEY_STEP); render(); }
  });

  render();
}

main();
