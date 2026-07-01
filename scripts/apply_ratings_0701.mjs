// SofaScore 공식 평점 적용 — 2026-07-01 32강 6경기(match-74~79).
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
  'match-74': { team: { germany: 6.95, paraguay: 7.14 }, rows: {
    '독일': [[1,7.6],[18,6.7],[17,8.3],[2,7.2],[5,6.5],[4,6.6],[23,6.4],[26,6.2],[7,7.6],[6,8.0],[19,6.2],[8,6.5],[10,7.3],[3,7.0],[11,6.2],[24,6.7],[20,7.1]],
    '파라과이': [[12,9.9],[10,7.1],[4,6.8],[16,6.9],[15,5.9],[21,6.6],[14,6.9],[13,8.0],[19,7.7],[23,7.1],[6,6.2],[24,6.8],[11,7.7],[2,6.8],[20,6.6],[9,6.2]] } },
  'match-75': { team: { netherlands: 6.78, morocco: 6.86 }, rows: {
    '네덜란드': [[1,8.3],[5,6.7],[15,6.6],[4,7.0],[11,6.9],[21,6.8],[8,6.5],[24,6.5],[6,6.8],[22,6.3],[19,6.9],[20,7.2],[9,7.5],[25,6.5],[26,6.0],[3,6.6],[7,6.1]],
    '모로코': [[1,6.8],[2,6.3],[10,6.3],[6,6.9],[14,7.5],[11,6.4],[8,7.2],[18,6.4],[24,7.1],[23,5.7],[3,7.6],[26,7.0],[16,6.7],[15,6.9],[9,7.4],[7,7.4]] } },
  'match-76': { team: { brazil: 7.06, japan: 6.67 }, rows: {
    '브라질': [[1,6.4],[16,7.3],[3,7.9],[4,7.8],[13,6.0],[20,6.8],[5,7.9],[8,7.4],[7,7.5],[9,6.3],[26,7.4],[19,6.2],[22,7.4],[17,6.6]],
    '일본': [[18,6.0],[10,6.5],[22,7.6],[14,6.9],[24,7.7],[3,6.8],[1,7.0],[15,6.5],[11,6.8],[21,6.3],[13,6.5],[2,6.6],[25,6.3],[7,6.2],[6,6.4]] } },
  'match-77': { team: { france: 7.35, sweden: 6.59 }, rows: {
    '프랑스': [[16,7.7],[3,7.1],[12,7.9],[14,6.9],[17,7.2],[11,8.8],[10,9.8],[4,7.0],[8,7.6],[7,7.4],[5,7.1],[2,6.7],[20,6.7],[19,6.9],[24,6.5],[22,6.3]],
    '스웨덴': [[1,8.2],[11,6.4],[8,5.9],[17,6.9],[7,6.7],[2,6.4],[18,6.6],[3,6.5],[9,6.2],[24,6.5],[5,6.2],[22,6.5],[26,6.5],[19,6.8],[10,6.6]] } },
  'match-78': { team: { 'ivory-coast': 6.98, norway: 6.95 }, rows: {
    '코트디부아르': [[1,6.9],[3,6.4],[11,7.3],[20,7.0],[18,7.6],[26,6.9],[7,6.8],[8,6.5],[9,6.1],[17,6.7],[19,6.8],[15,9.5],[12,6.5],[14,6.7]],
    '노르웨이': [[1,7.8],[7,6.8],[10,7.2],[16,6.1],[3,7.6],[9,7.4],[8,6.6],[17,6.7],[20,7.3],[6,8.0],[5,6.0],[21,6.4],[22,6.6],[14,6.8]] } },
  'match-79': { team: { mexico: 7.12, ecuador: 6.48 }, rows: {
    '멕시코': [[1,7.6],[23,6.6],[7,6.8],[16,8.2],[5,7.6],[6,7.1],[9,7.7],[3,7.7],[19,7.3],[25,7.2],[2,7.0],[26,6.5],[18,6.5],[11,7.0],[15,6.8],[17,6.1]],
    '에콰도르': [[1,8.4],[9,7.2],[21,5.9],[19,6.5],[23,7.3],[4,5.5],[15,6.7],[6,5.8],[13,6.0],[20,6.6],[3,6.5],[26,6.6],[17,6.3],[11,6.4],[10,6.8],[16,6.0]] } },
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
