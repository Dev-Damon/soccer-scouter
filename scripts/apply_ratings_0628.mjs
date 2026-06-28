// SofaScore 공식 평점 적용 — 2026-06-28 조별리그 3차전 6경기.
// 매핑 키: (팀 한글명, 등번호) → D.players → 한글 선수명 → match-ratings.json byName.
// match-ratings.json은 웹/토스 공통 런타임 로드(파일 push만으로 양쪽 반영).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// data.js 로드(window.DATA)
global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'));
const D = global.window.DATA;
const byTeamNum = {};
for (const p of D.players) byTeamNum[p.team + '#' + p.number] = p;

// [등번호, 평점] 목록 — 스크린샷 그대로(선발 11 + 교체, 평점표기 없는 선수 제외)
const M = {
  'match-71': { team: { panama: 6.53, england: 7.09 }, rows: {
    '파나마': [[26,6.5],[7,6.2],[16,6.3],[11,6.3],[9,6.2],[14,6.8],[22,6.8],[3,7.1],[4,6.8],[23,6.4],[6,6.7],[17,6.3],[10,6.4],[24,6.6],[15,6.7],[19,6.4]],
    '잉글랜드': [[7,6.6],[26,7.2],[17,6.4],[2,7.4],[9,7.5],[8,7.6],[10,9.3],[6,7.7],[1,7.1],[11,6.4],[3,7.0],[25,7.0],[20,6.5],[21,6.5],[14,6.8],[19,6.5]] } },
  'match-72': { team: { croatia: 6.88, ghana: 6.51 }, rows: {
    '크로아티아': [[14,6.7],[16,8.9],[8,6.9],[3,6.7],[17,8.6],[11,6.0],[1,6.4],[6,7.2],[10,7.7],[13,7.2],[2,6.0],[20,6.6],[15,6.7],[4,6.9],[24,6.5]],
    '가나': [[11,6.2],[26,6.4],[15,6.3],[4,6.5],[9,6.2],[5,6.5],[16,5.9],[8,6.3],[23,7.3],[22,6.3],[14,6.5],[21,6.3],[7,6.8],[10,6.6],[24,7.1],[3,6.6]] } },
  'match-66': { team: { 'dr-congo': 6.86, uzbekistan: 6.44 }, rows: {
    '콩고민주공화국': [[26,7.0],[9,6.5],[4,7.0],[14,7.6],[20,8.0],[22,7.0],[8,7.1],[1,6.2],[17,6.0],[2,7.0],[7,6.7],[19,6.8],[10,6.5],[6,6.6],[13,7.0],[12,6.7]],
    '우즈베키스탄': [[3,6.4],[5,6.6],[17,6.5],[6,6.9],[14,6.9],[7,6.7],[2,5.8],[12,5.9],[22,6.6],[13,6.7],[26,6.3],[19,6.5],[9,6.2],[11,6.2],[8,6.3],[21,6.5]] } },
  'match-65': { team: { colombia: 6.94, portugal: 7.05 }, rows: {
    '콜롬비아': [[22,7.1],[14,6.9],[7,6.3],[3,7.2],[16,6.6],[9,6.3],[12,7.4],[23,7.5],[11,7.1],[10,8.3],[4,7.5],[6,6.5],[25,6.1],[20,6.8],[5,6.7],[2,6.8]],
    '포르투갈': [[18,6.6],[20,7.0],[21,6.6],[3,7.3],[7,6.5],[8,7.4],[1,8.2],[13,7.5],[23,7.5],[11,6.4],[25,7.0],[5,7.3],[15,6.5],[24,7.0],[17,7.0]] } },
  'match-60': { team: { jordan: 6.36, argentina: 6.79 }, rows: {
    '요르단': [[4,5.9],[20,5.7],[9,6.6],[8,6.5],[11,6.6],[1,5.7],[5,5.8],[21,6.2],[24,6.9],[3,6.0],[23,6.7],[13,6.5],[10,7.6],[6,6.4]],
    '아르헨티나': [[17,6.1],[14,6.8],[22,6.4],[18,6.7],[19,6.9],[5,7.1],[2,6.9],[23,6.6],[9,5.9],[11,7.9],[3,6.7],[16,6.5],[10,8.0],[20,7.0],[8,6.8],[21,6.3]] } },
  'match-59': { team: { algeria: 6.78, austria: 6.59 }, rows: {
    '알제리': [[13,6.4],[8,7.4],[19,7.2],[21,6.3],[22,6.8],[9,6.6],[16,5.2],[2,6.5],[10,7.3],[7,9.0],[17,7.2],[5,6.5],[15,6.3],[26,6.2],[25,6.5]],
    '오스트리아': [[20,6.5],[5,5.7],[6,6.5],[15,5.8],[7,7.5],[18,6.0],[1,6.7],[8,6.8],[4,6.6],[9,7.4],[16,6.0],[10,6.7],[24,6.5],[11,7.0],[3,6.3],[14,7.5]] } },
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
