import {
  LAT, LON, DEG,
  S_MIN, S_MAX, Y_MIN, Y_MAX,
  BOXES, N_BOXES,
  sunPos, sunDir,
} from './shared.js';

// ── UI constants ───────────────────────────────────────────
const CANVAS_WIDTH   = 800;             // canvas width in pixels
const SLIDER_MIN     = 300;             // 5:00 AM in minutes from midnight
const SLIDER_MAX     = 1260;            // 9:00 PM in minutes from midnight
const ARROW_KEY_STEP = 15;              // minutes per arrow key press

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
