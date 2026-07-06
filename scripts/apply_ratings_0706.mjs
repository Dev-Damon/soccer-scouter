// SofaScore 공식 평점 적용 — match-92 멕시코 vs 잉글랜드(8강).
// 매핑: (팀 한글명, 등번호) → D.players → 한글 선수명 → match-ratings.json byName. push만으로 웹/토스 런타임 반영.
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
  'match-92': { team: { mexico: 6.70, england: 6.86 }, rows: {
    '멕시코': [[1,6.1],[23,6.5],[5,6.8],[3,6.3],[2,5.8],[7,6.2],[6,7.2],[19,5.7],[16,7.9],[9,7.1],[25,7.5],[4,7.2],[26,7.1],[11,6.3],[8,7.1],[22,6.4]],
    '잉글랜드': [[1,7.3],[26,5.5],[2,6.2],[6,6.6],[3,6.1],[4,6.4],[8,7.2],[7,7.2],[10,9.0],[18,7.3],[9,7.2],[5,6.6],[25,6.8],[15,7.0],[17,6.5]] } },
};

const RAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'match-ratings.json'), 'utf8'));
let totalMiss = 0;
for (const [mid, cfg] of Object.entries(M)) {
  const byName = {};
  let matched = 0;
  for (const [teamKo, rows] of Object.entries(cfg.rows)) {
    const teamPlayers = D.players.filter((p) => p.team === teamKo).length;
    if (!teamPlayers) { console.log(`⚠️  팀 없음: "${teamKo}" (${mid})`); }
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
console.log(`\n총 미매칭: ${totalMiss}`);
console.log('match-ratings.json 저장 완료. keys:', Object.keys(RAT).sort((a,b)=>(+a.split('-')[1])-(+b.split('-')[1])).join(' '));
