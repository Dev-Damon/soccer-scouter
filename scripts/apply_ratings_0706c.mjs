// SofaScore 평점 대량 적용 — 녹아웃 여러 경기. 영문 팀명→id(슬러그)→한글명→선수 매핑. mid는 ko_teams/fixtures에서 팀쌍으로 자동해소.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'));
const D = global.window.DATA;
const byId = {}; D.teams.forEach(t => byId[t.id] = t);
const byTeamNum = {}; for (const p of D.players) byTeamNum[p.team + '#' + p.number] = p;

const EN_OVR = { 'Cape Verde': 'cape-verde', 'Ivory Coast': 'ivory-coast', 'South Korea': 'south-korea', 'DR Congo': 'dr-congo', 'Saudi Arabia': 'saudi-arabia', 'United States': 'united-states', 'South Africa': 'south-africa', 'Bosnia & Herzegovina': 'bosnia-and-herzegovina', 'Uzbekistan': 'uzbekistan' };
function enToId(en) { return EN_OVR[en] || en.toLowerCase().replace(/\s+/g, '-'); }

// mid 해소: ko_teams(런타임) + 정적 fixtures
const KO = JSON.parse(fs.readFileSync('/tmp/ko_teams.json', 'utf8'));
const pairMid = {};
for (const mid of Object.keys(KO)) { const k = KO[mid]; if (k.homeId && k.awayId) pairMid[[k.homeId, k.awayId].sort().join('|')] = mid; }
D.fixtures.forEach(f => { if (f.homeId && f.awayId) pairMid[[f.homeId, f.awayId].sort().join('|')] = f.id; });

// 판독 결과: {a,b(영문), avgA,avgB, A:[[num,rat]], B:[[num,rat]]}
const MATCHES = JSON.parse(fs.readFileSync('/tmp/all_matches.json', 'utf8'));

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
  console.log(`✓ ${mid} ${M.a} vs ${M.b}: ${matched}명`);
}
fs.writeFileSync(path.join(ROOT, 'match-ratings.json'), JSON.stringify(RAT, null, 1));
console.log(`총 미매칭 ${miss} · keys ${Object.keys(RAT).length}`);
