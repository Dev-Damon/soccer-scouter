// SofaScore 공식 평점 적용 — 2026-06-29 32강 남아공 vs 캐나다(match-73).
// 매핑: (팀 한글명, 등번호) → D.players → 한글 선수명 → match-ratings.json byName.
// match-ratings.json은 웹/토스 공통 런타임 로드(파일 push만으로 양쪽 반영).
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
  'match-73': { team: { 'south-africa': 6.86, canada: 6.84 }, rows: {
    '남아프리카공화국': [[1,8.2],[6,7.7],[14,7.2],[13,7.3],[21,6.9],[7,6.2],[4,6.6],[10,6.8],[17,6.5],[20,7.0],[12,6.6],[5,6.4],[8,6.5],[15,6.2]],
    '캐나다': [[16,6.9],[17,6.0],[2,7.2],[25,7.0],[15,6.8],[10,6.0],[7,8.8],[13,7.2],[12,7.1],[11,6.4],[22,6.9],[4,7.4],[23,6.5],[14,6.3],[24,6.5],[19,6.5]] } },
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
