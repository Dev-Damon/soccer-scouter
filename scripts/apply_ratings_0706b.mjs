// SofaScore 공식 평점 적용 — match-91 브라질 vs 노르웨이(16강).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'));
const D = global.window.DATA;
const byTeamNum = {};
for (const p of D.players) byTeamNum[p.team + '#' + p.number] = p;

const M = {
  'match-91': { team: { brazil: 6.71, norway: 7.04 }, rows: {
    '브라질': [[1,6.8],[16,6.9],[22,7.3],[3,6.3],[5,7.1],[4,6.3],[8,6.1],[13,6.7],[26,7.0],[7,7.2],[9,6.7],[19,6.4],[18,6.8],[10,6.8],[2,6.2]],
    '노르웨이': [[1,7.9],[7,6.3],[10,6.3],[26,6.9],[3,6.7],[9,9.1],[8,7.4],[17,6.8],[20,6.4],[6,7.1],[5,7.2],[21,7.2],[22,6.7],[14,6.6]] } },
};

const RAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'match-ratings.json'), 'utf8'));
let totalMiss = 0;
for (const [mid, cfg] of Object.entries(M)) {
  const byName = {};
  let matched = 0;
  for (const [teamKo, rows] of Object.entries(cfg.rows)) {
    if (!D.players.some((p) => p.team === teamKo)) console.log(`⚠️  팀 없음: "${teamKo}" (${mid})`);
    for (const [num, r] of rows) {
      const p = byTeamNum[teamKo + '#' + num];
      if (!p) { console.log(`  ✗ ${mid} ${teamKo} #${num} → 선수 없음`); totalMiss++; continue; }
      byName[p.name] = r;
      matched++;
    }
  }
  RAT[mid] = { team: cfg.team, byName };
  console.log(`✓ ${mid}: ${matched}명 평점, team=${JSON.stringify(cfg.team)}`);
}
fs.writeFileSync(path.join(ROOT, 'match-ratings.json'), JSON.stringify(RAT, null, 1));
console.log(`총 미매칭: ${totalMiss}`);
