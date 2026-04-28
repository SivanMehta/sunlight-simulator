#!/usr/bin/env node
// Compute Daily Light Integral (DLI, mol/m²/day) across the yard during growing season (Apr 1 - Sep 1, 9am-5pm).
// Uses clear-sky irradiance model (Meinel) to weight each sample by PAR intensity.
// Outputs one CSV row per sample point with season total and average-daily DLI.

import { writeFileSync } from 'fs';
import { Y_MIN, Y_MAX, sunPos, sunDir, inShadow, seattleCloudCover, cloudyPPFD } from '../shared.js';

const YEAR = parseInt(process.argv[2] || '2026', 10);
const GRID_X = 60;                // 0.25 ft samples across 15 ft yard width
const GRID_Y = 108;                // 0.25 ft samples across 27 ft yard length
const SAMPLE_STEP_MIN = 5;       // 5-minute sampling for finer temporal resolution
const SAMPLE_STEP_SEC = SAMPLE_STEP_MIN * 60;  // 900 seconds per sample
const RAY_START_Z = 0.01;

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const xStep = (Y_MAX[0] - Y_MIN[0]) / GRID_X;
const yStep = (Y_MAX[1] - Y_MIN[1]) / GRID_Y;
const pointCount = GRID_X * GRID_Y;

const points = [];
for (let yi = 0; yi < GRID_Y; yi++) {
  const y = Y_MIN[1] + (yi + 0.5) * yStep;
  for (let xi = 0; xi < GRID_X; xi++) {
    const x = Y_MIN[0] + (xi + 0.5) * xStep;
    points.push({ xIndex: xi, yIndex: yi, x, y, dliMol: 0 });
  }
}

const start = new Date(YEAR, 3, 1);  // April 1
const end = new Date(YEAR, 8, 1);   // September 1
const startDate = formatDate(start);
const endDate = formatDate(end);
let dayCount = 0;

for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  dayCount++;
  const yr = d.getFullYear();
  const mo = d.getMonth() + 1;
  const dy = d.getDate();
  
  // Get Seattle's typical cloud cover for this month
  const clearFraction = seattleCloudCover(mo);

  for (let totalMin = 540; totalMin <= 1020; totalMin += SAMPLE_STEP_MIN) {  // 9am-5pm
    const hour = Math.floor(totalMin / 60);
    const minute = totalMin % 60;
    const { alt, az } = sunPos(yr, mo, dy, hour, minute);
    if (alt <= 0) continue;

    const { direct, diffuse } = cloudyPPFD(alt, clearFraction);
    const dir = sunDir(alt, az);
    
    for (const point of points) {
      const shaded = inShadow(point.x, point.y, RAY_START_Z, dir);
      // Shadow effect only matters when sky is clear. Overcast (clearFraction=0) → no shadows.
      // Unshaded points get direct+diffuse; shaded points get diffuse only; shadow contribution scaled by clearness.
      const directContribution = shaded ? 0 : direct;
      const ppfd = diffuse + directContribution * clearFraction;
      // Convert PPFD (µmol/m²/s) × time (s) → mol/m²
      point.dliMol += (ppfd * SAMPLE_STEP_SEC) / 1_000_000;
    }
  }

  if (dy === 1) {
    process.stderr.write(`${formatDate(d)} (${(clearFraction * 100).toFixed(0)}% clear) `);
  }
}

const rows = [
  'year,start_date,end_date,grid_x,grid_y,sample_step_minutes,x_index,y_index,x_ft,y_ft,season_dli_mol,avg_daily_dli',
];

for (const point of points) {
  rows.push([
    YEAR,
    startDate,
    endDate,
    GRID_X,
    GRID_Y,
    SAMPLE_STEP_MIN,
    point.xIndex,
    point.yIndex,
    point.x.toFixed(3),
    point.y.toFixed(3),
    point.dliMol.toFixed(2),
    (point.dliMol / dayCount).toFixed(3),
  ].join(','));
}

const outPath = new URL(`./sun-hours-heatmap-${YEAR}.csv`, import.meta.url).pathname;
writeFileSync(outPath, rows.join('\n') + '\n');
process.stderr.write(`\nWrote ${pointCount} yard samples to ${outPath}\n`);
