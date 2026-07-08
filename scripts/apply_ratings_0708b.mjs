// SofaScore 평점 적용 — match-96 스위스 vs 콜롬비아(선발+교체). 팀한글명+등번호 매핑.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'));
const D = global.window.DATA;
const byId = {}; D.teams.forEach(t => byId[t.id] = t);
const byTeamNum = {}; for (const p of D.players) byTeamNum[p.team + '#' + p.number] = p;

function enToId(en) { return en.toLowerCase().replace(/\s+/g, '-'); }

const KO = JSON.parse(fs.readFileSync(path.join(ROOT, 'ko_teams.json'), 'utf8'));
const pairMid = {};
for (const mid of Object.keys(KO)) { const k = KO[mid]; if (k.homeId && k.awayId) pairMid[[k.homeId, k.awayId].sort().join('|')] = mid; }
D.fixtures.forEach(f => { if (f.homeId && f.awayId) pairMid[[f.homeId, f.awayId].sort().join('|')] = f.id; });

const MATCHES = [
  {
    a: 'Switzerland', b: 'Colombia', avgA: 7.01, avgB: 6.93,
    A: [
      [1, 8.8], [13, 6.6], [5, 6.8], [4, 7.5], [6, 6.8], [8, 7.0], [10, 7.8], [11, 6.9], [14, 6.3], [22, 6.6], [7, 6.3],
      [15, 6.7], [2, 6.9], [3, 6.9], [26, 7.0], [17, 7.2], [23, 7.0] // 교체: 소우, 무하임, 위드머, 이텐, 바르가스, 암두니
    ],
    B: [
      [11, 7.1], [2, 6.3], [16, 6.8], [23, 6.6], [25, 6.5], [10, 6.8], [14, 6.9], [3, 6.9], [12, 7.1], [7, 7.0], [17, 7.6],
      [20, 8.3], [21, 7.3], [6, 6.7], [19, 6.0] // 교체: 킨테로, 캄파스, 리오스, 쿠초 에르난데스
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
