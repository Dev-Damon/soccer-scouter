// 경기별 배당을 predict()로 계산해 콘솔에 SQL/JSON 출력 (Management API로 upsert)
const fs = require('fs');
global.window = {}; require('../data.js'); const D = global.window.DATA;
const teamsById = {}; D.teams.forEach(t => teamsById[t.id] = t);
function teamPower(t) {
  var i = t.indices || {};
  var vals = [i.attack, i.defense, i.organization, i.experience].filter(v => typeof v === 'number');
  if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
  return t.fifaRank ? Math.max(45, 92 - t.fifaRank * 0.4) : 55;
}
function predict(a, b) {
  var pa = teamPower(a), pb = teamPower(b), diff = pa - pb;
  var ea = 1 / (1 + Math.pow(10, -diff / 16));
  var draw = 0.30 * (1 - Math.min(1, Math.abs(diff) / 35));
  var winA = ea * (1 - draw), winB = (1 - ea) * (1 - draw);
  var s = winA + winB + draw; winA /= s; winB /= s; draw /= s;
  return { winA: winA, draw: draw, winB: winB };
}
function odds(p) { var o = Math.round((1 / Math.max(0.01, p)) * 10) / 10; return Math.min(10, Math.max(1.1, o)); }
const rows = [];
D.fixtures.forEach(fx => {
  if (!fx.homeId || !fx.awayId) return;
  var h = teamsById[fx.homeId], a = teamsById[fx.awayId];
  if (!h || !a) return;
  var pr = predict(h, a);
  rows.push({ match_id: fx.id, home: odds(pr.winA), draw: odds(pr.draw), away: odds(pr.winB) });
});
fs.writeFileSync('/tmp/odds_rows.json', JSON.stringify(rows));
console.log('배당 계산:', rows.length, '경기');
console.log('샘플:', JSON.stringify(rows.slice(0, 3)));
