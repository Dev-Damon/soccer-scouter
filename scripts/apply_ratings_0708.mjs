// SofaScore 평점 적용 — match-95 아르헨티나 vs 이집트(선발+교체). 팀한글명+등번호로 매핑.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'));
const D = global.window.DATA;
const byId = {}; D.teams.forEach(t => byId[t.id] = t);
const byTeamNum = {}; for (const p of D.players) byTeamNum[p.team + '#' + p.number] = p;

const EN_OVR = { 'Cape Verde': 'cape-verde' };
function enToId(en) { return EN_OVR[en] || en.toLowerCase().replace(/\s+/g, '-'); }

// mid 해소: ko_teams(런타임 실팀) + 정적 fixtures
const KO = JSON.parse(fs.readFileSync(path.join(ROOT, 'ko_teams.json'), 'utf8'));
const pairMid = {};
for (const mid of Object.keys(KO)) { const k = KO[mid]; if (k.homeId && k.awayId) pairMid[[k.homeId, k.awayId].sort().join('|')] = mid; }
D.fixtures.forEach(f => { if (f.homeId && f.awayId) pairMid[[f.homeId, f.awayId].sort().join('|')] = f.id; });

// 판독 결과(스크린샷): 선발 XI + 평점 있는 교체선수만. [등번호, 평점]
const MATCHES = [
  {
    a: 'Argentina', b: 'Egypt', avgA: 7.15, avgB: 6.67,
    A: [
      [23, 6.0], [3, 6.5], [6, 7.0], [5, 8.3], [20, 6.5], [13, 7.7], [24, 8.0], [9, 6.9], [10, 9.3], [7, 6.7], [26, 6.5],
      [15, 6.7], [22, 7.1], [4, 6.9] // 교체: 니콜라스 곤살레스, 라우타로, 몬티엘
    ],
    B: [
      [12, 6.7], [3, 5.7], [17, 6.6], [2, 7.3], [10, 8.7], [23, 7.3], [19, 6.6], [5, 6.8], [11, 7.6], [8, 6.4], [15, 6.2],
      [14, 6.6], [7, 6.4], [22, 6.5] // 교체: 함디 파티, 트레제게, 마르무시
    ]
  }
];

const RAT = JSON.parse(fs.readFileSync(path.join(ROOT, 'match-ratings.json'), 'utf8'));
let miss = 0;
for (const M of MATCHES) {
  const aid = enToId(M.a), bid = enToId(M.b);
  if (!byId[aid] || !byId[bid]) { console.log(`⚠️ 팀 id 없음: ${M.a}(${aid}) / ${M.b}(${bid})`); continue; }
  const mid = pairMid[[aid, bid].sort().join('|')];
  if (!mid) { console.log(`⚠️ mid 못찾음: ${M.a} vs ${M.b}`); continue; }
  const aKo = byId[aid].name, bKo = byId[bid].name, byName = {};
  let matched = 0;
  for (const [teamKo, rows] of [[aKo, M.A], [bKo, M.B]]) {
    for (const [num, r] of rows) {
      const p = byTeamNum[teamKo + '#' + num];
      if (!p) { console.log(`  ✗ ${mid} ${teamKo} #${num} 없음`); miss++; continue; }
      byName[p.name] = r; matched++;
    }
  }
  RAT[mid] = { team: { [aid]: M.avgA, [bid]: M.avgB }, byName };
  console.log(`✓ ${mid} ${M.a} vs ${M.b}: ${matched}명 (avg ${M.avgA}/${M.avgB})`);
}
fs.writeFileSync(path.join(ROOT, 'match-ratings.json'), JSON.stringify(RAT, null, 1));
console.log(`총 미매칭 ${miss} · keys ${Object.keys(RAT).length}`);
