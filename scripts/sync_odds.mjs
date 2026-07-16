// 베팅 배당 동기화 — match_odds 테이블을 화면(app.js betOddsOf)과 동일한 공식으로 채움.
// 조별리그는 fixtures의 확정팀, 녹아웃은 kicktalk.xyz/ko_teams.json의 확정팀 기준.
// place_bet RPC가 match_odds에서 배당을 읽으므로, 녹아웃 라운드가 확정될 때마다 이 스크립트가 배당을 채워야
// "화면 1.7인데 저장은 2.0" 버그(match_odds에 행이 없으면 place_bet이 od:=2.0 기본값)가 재발하지 않음.
// 보호 RPC admin_upsert_odds(p_secret, p_rows) 호출 — 시크릿은 env ODDS_SYNC_SECRET. settle.yml에서 20분마다 실행.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://jhzchgvnkwdroxfrgjvm.supabase.co';
const ANON = 'sb_publishable_AsDWJPjKDg1S5wqezB9Vtw_uxKFmE26';
const SECRET = process.env.ODDS_SYNC_SECRET || '';
if (!SECRET) { console.error('ODDS_SYNC_SECRET 없음 — 스킵'); process.exit(0); }

globalThis.window = {};
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'));
const D = globalThis.window.DATA, byId = {}; D.teams.forEach(t => byId[t.id] = t);
const fxById = {}; D.fixtures.forEach(f => fxById[f.id] = f);

// app.js에서 그대로 옮긴 배당 계산(betOddsOf = od(predict))
// ⚠️ app.js의 predict와 **반드시 같아야 한다**. 화면 배당은 app.js가, 실제 저장 배당은 이 스크립트가
//    계산하므로 한쪽만 바꾸면 어긋난다(2026-07-03에 녹아웃이 전부 2.0으로 저장된 사고).
//    그래서 실제 배당은 양쪽 다 market-odds.json 하나만 본다.
function teamPower(t) { var i = t.indices || {}; var v = [i.attack, i.defense, i.organization, i.experience].filter(x => typeof x === 'number'); if (v.length) return v.reduce((a, b) => a + b, 0) / v.length; return t.fifaRank ? Math.max(45, 92 - t.fifaRank * 0.4) : 55; }
function pct100(vals) { var fl = vals.map(v => Math.floor(v)); var rem = 100 - fl.reduce((a, b) => a + b, 0); var idx = vals.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f); for (var k = 0; k < rem && k < idx.length; k++) fl[idx[k].i]++; return fl; }

// 실제 북메이커 배당(market-odds.json). 있으면 자체 추정보다 우선 — app.js와 동일 규칙.
let MARKET_ODDS = {};
try {
  const m = await fetch('https://kicktalk.xyz/market-odds.json?b=' + Date.now()).then(r => r.json());
  if (m && typeof m === 'object') for (const k of Object.keys(m)) if (k !== '_' && m[k] && m[k].p) MARKET_ODDS[k] = m[k];
  console.log(`market-odds.json: ${Object.keys(MARKET_ODDS).length}경기`);
} catch (e) { console.error('market-odds fetch 실패(자체 추정으로 진행):', e.message); }
function marketFor(aId, bId) { const m = MARKET_ODDS[[aId, bId].sort().join('|')]; return (m && m.p && m.p[aId] != null && m.p[bId] != null) ? m : null; }

function predict(a, b) {
  const mk = marketFor(a.id, b.id);
  if (mk) { const q = pct100([mk.p[a.id] * 100, mk.p.draw * 100, mk.p[b.id] * 100]); return { winA: q[0], draw: q[1], winB: q[2], mkt: true }; }
  var pa = teamPower(a), pb = teamPower(b), diff = pa - pb; var ea = 1 / (1 + Math.pow(10, -diff / 16)); var draw = 0.30 * (1 - Math.min(1, Math.abs(diff) / 35)); var winA = ea * (1 - draw), winB = (1 - ea) * (1 - draw); var s = winA + winB + draw; winA /= s; winB /= s; draw /= s; var pct = pct100([winA * 100, draw * 100, winB * 100]); return { winA: pct[0], draw: pct[1], winB: pct[2], mkt: false };
}
function od(p) { return Math.min(10, Math.max(1.1, Math.round(1000 / Math.max(1, p * 1.12)) / 10)); }
function koUtc(f) { try { return new Date(`${f.kstDate}T${f.kstTime}:00+09:00`).toISOString(); } catch (e) { return null; } }

// 확정팀 맵: 조별=fixtures, 녹아웃=ko_teams.json
const resolved = {};
D.fixtures.forEach(f => { if (f.homeId && f.awayId && byId[f.homeId] && byId[f.awayId]) resolved[f.id] = { homeId: f.homeId, awayId: f.awayId }; });
try {
  const ko = await fetch('https://kicktalk.xyz/ko_teams.json?b=' + Date.now()).then(r => r.json());
  for (const mid of Object.keys(ko)) { const k = ko[mid]; if (k.homeId && k.awayId && byId[k.homeId] && byId[k.awayId]) resolved[mid] = { homeId: k.homeId, awayId: k.awayId }; }
} catch (e) { console.error('ko_teams fetch 실패(조별만 동기화):', e.message); }

const rows = [];
for (const mid of Object.keys(resolved)) {
  const f = fxById[mid]; if (!f) continue;
  const pr = predict(byId[resolved[mid].homeId], byId[resolved[mid].awayId]);
  const ko = koUtc(f); if (!ko) continue;
  rows.push({ mid, home: od(pr.winA), draw: od(pr.draw), away: od(pr.winB), ko });
}
if (!rows.length) { console.log('동기화할 경기 없음'); process.exit(0); }

const r = await fetch(URL + '/rest/v1/rpc/admin_upsert_odds', {
  method: 'POST',
  headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_secret: SECRET, p_rows: rows })
});
if (!r.ok) { console.error('RPC 실패', r.status, await r.text()); process.exit(1); }
console.log('✓ match_odds 동기화 완료:', await r.text(), '경기 (총 후보', rows.length + ')');
