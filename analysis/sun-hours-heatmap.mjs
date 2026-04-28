#!/usr/bin/env node
// Compute direct-sun exposure across the yard over Seattle summer:
// Memorial Day through Labor Day, inclusive.
// Outputs one CSV row per sample point with period total and average-daily sun hours.

import { writeFileSync } from 'fs';
import { Y_MIN, Y_MAX, sunPos, sunDir, inShadow } from '../shared.js';

const YEAR = parseInt(process.argv[2] || '2026', 10);
const GRID_X = 60;                // 0.25 ft samples across 15 ft yard width
const GRID_Y = 108;                // 0.25 ft samples across 27 ft yard length
const SAMPLE_STEP_MIN = 15;       // quarter-hour sampling
const SAMPLE_HOURS = SAMPLE_STEP_MIN / 60;
const RAY_START_Z = 0.01;

function memorialDay(year) {
  const may31 = new Date(year, 4, 31);
  const day = may31.getDay();
  const offset = day === 1 ? 0 : (day + 6) % 7;
  return new Date(year, 4, 31 - offset);
}

function laborDay(year) {
  const sep1 = new Date(year, 8, 1);
  const day = sep1.getDay();
  const offset = day === 1 ? 0 : (8 - day) % 7;
  return new Date(year, 8, 1 + offset);
}

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
    points.push({ xIndex: xi, yIndex: yi, x, y, sunHours: 0 });
  }
}

const start = memorialDay(YEAR);
const end = laborDay(YEAR);
const startDate = formatDate(start);
const endDate = formatDate(end);
let dayCount = 0;

for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  dayCount++;
  const yr = d.getFullYear();
  const mo = d.getMonth() + 1;
  const dy = d.getDate();

  for (let totalMin = 0; totalMin < 24 * 60; totalMin += SAMPLE_STEP_MIN) {
    const hour = Math.floor(totalMin / 60);
    const minute = totalMin % 60;
    const { alt, az } = sunPos(yr, mo, dy, hour, minute);
    if (alt <= 0) continue;

    const dir = sunDir(alt, az);
    for (const point of points) {
      if (!inShadow(point.x, point.y, RAY_START_Z, dir)) {
        point.sunHours += SAMPLE_HOURS;
      }
    }
  }

  if (dy === 1 || (mo === 5 && dy === start.getDate()) || (mo === 9 && dy === end.getDate())) {
    process.stderr.write(`${formatDate(d)} `);
  }
}

const rows = [
  'year,start_date,end_date,grid_x,grid_y,sample_step_minutes,x_index,y_index,x_ft,y_ft,summer_sun_hours,avg_summer_day_sun_hours',
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
    point.sunHours.toFixed(2),
    (point.sunHours / dayCount).toFixed(3),
  ].join(','));
}

const outPath = new URL(`./summer-sun-hours-heatmap-${YEAR}.csv`, import.meta.url).pathname;
writeFileSync(outPath, rows.join('\n') + '\n');
process.stderr.write(`\nWrote ${pointCount} yard samples to ${outPath}\n`);
