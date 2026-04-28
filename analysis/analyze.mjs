#!/usr/bin/env node
// Compute the percentage of yard directly sunlit at 12:00 PM
// for every day of a given year. Outputs CSV.

import { writeFileSync } from 'fs';
import { Y_MIN, Y_MAX, sunPos, sunDir, inShadow } from '../shared.js';

const YEAR = parseInt(process.argv[2] || '2026', 10);
const GRID_RES = 60;                    // sample points per axis (60×60 = 3600 samples)
const NOON_H = 12, NOON_M = 0;         // local time to evaluate
const RAY_START_Z = 0.01;              // ground clearance for shadow rays

// Pre-compute sample grid positions within the yard
const xStep = (Y_MAX[0] - Y_MIN[0]) / GRID_RES;
const yStep = (Y_MAX[1] - Y_MIN[1]) / GRID_RES;
const totalSamples = GRID_RES * GRID_RES;

const rows = ['date,percent_lit'];

// Iterate every day of the year
const start = new Date(YEAR, 0, 1);
const end   = new Date(YEAR + 1, 0, 1);
for (let d = start; d < end; d.setDate(d.getDate() + 1)) {
  const yr = d.getFullYear();
  const mo = d.getMonth() + 1;
  const dy = d.getDate();

  const { alt, az } = sunPos(yr, mo, dy, NOON_H, NOON_M);

  let litCount = 0;
  if (alt > 0) {
    const dir = sunDir(alt, az);
    for (let yi = 0; yi < GRID_RES; yi++) {
      const y = Y_MIN[1] + (yi + 0.5) * yStep;
      for (let xi = 0; xi < GRID_RES; xi++) {
        const x = Y_MIN[0] + (xi + 0.5) * xStep;
        if (!inShadow(x, y, RAY_START_Z, dir)) litCount++;
      }
    }
  }

  const pct = ((litCount / totalSamples) * 100).toFixed(2);
  const dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
  rows.push(`${dateStr},${pct}`);

  // Progress indicator (one dot per month boundary)
  if (dy === 1) process.stderr.write(`${dateStr} `);
}

const outPath = new URL('./sunlight-2026.csv', import.meta.url).pathname;
writeFileSync(outPath, rows.join('\n') + '\n');
process.stderr.write(`\nWrote ${rows.length - 1} days to ${outPath}\n`);
