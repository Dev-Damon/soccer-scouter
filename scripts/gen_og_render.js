// 경기별 OG 이미지(ogm/<slug>.png) 생성 — 앱 경기카드(라이트) 디자인, HTML→Playwright.
// 종료 경기는 DB match_results의 실제 점수·득점자 반영, 예정 경기는 킥오프 시각.
// 사용: node scripts/gen_og_render.js            (전부)
//       node scripts/gen_og_render.js match-19   (특정 경기만)
const https = require('https'), path = require('path'), fs = require('fs');
const { renderMany } = require('./render_og');
const ROOT = path.dirname(__dirname);
const SBP = 'sb_publishable_AsDWJPjKDg1S5wqezB9Vtw_uxKFmE26';  // GET 읽기 가능(공개안전)
global.window = {}; require(path.join(ROOT, 'data.js')); const D = global.window.DATA;
const teamsById = {}; D.teams.forEach(t => teamsById[t.id] = t);
function normName(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ð/g, 'd').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss').replace(/þ/g, 'th').replace(/[^a-z ]/g, '').trim(); }
const nameMap = {}; (D.players || []).forEach(p => { if (!p.nameEn) return; [p.nameEn, p.aliasEn].forEach(en => { if (!en) return; const n = normName(en); nameMap[n] = p; const s = '_s' + n.split(' ').pop(); if (!nameMap[s]) nameMap[s] = p; }); });
function pbn(nm) { const n = normName(nm); return nameMap[n] || nameMap['_s' + n.split(' ').pop()] || null; }
// 잔디/득점자 표시명 오버라이드(app.js PITCH_OVERRIDE와 동일하게 유지)
const OG_OVERRIDE = { "vinicius-junior": "비니시우스", "virgil-van-dijk": "반 다이크", "micky-van-de-ven": "반 데 벤", "jan-paul-van-hecke": "판 헤케", "marten-de-roon": "더 론", "kevin-de-bruyne": "데 브라위너", "charles-de-ketelaere": "데 케텔라레", "maxim-de-cuyper": "더 카위퍼르", "koni-de-winter": "더 빈터르" };
const KDAY = ['일', '월', '화', '수', '목', '금', '토'];
function kstStr(f) {
  const d = f.kstDate || f.date || '', t = f.kstTime || f.time || '';
  try { const dt = new Date(d + 'T00:00:00Z'); return dt.getUTCMonth() + 1 + '.' + dt.getUTCDate() + '(' + KDAY[dt.getUTCDay()] + ') ' + t + ' KST'; }
  catch (e) { return (d + ' ' + t).trim(); }
}
function get(url) { return new Promise(r => { https.get(url, { headers: { apikey: SBP, Authorization: 'Bearer ' + SBP } }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => r(s)); }).on('error', () => r('')); }); }

(async () => {
  const only = process.argv[2];  // 선택: 특정 mid만
  let MR = {};
  try { const j = JSON.parse(await get('https://jhzchgvnkwdroxfrgjvm.supabase.co/rest/v1/app_data?key=eq.match_results&select=data')); MR = (j[0] && j[0].data) || {}; } catch (e) {}
  const items = [];
  D.fixtures.forEach(fx => {
    if (!(fx.homeId && fx.awayId)) return;
    if (only && fx.id !== only) return;
    const home = teamsById[fx.homeId] || {}, away = teamsById[fx.awayId] || {};
    const homeName = fx.homeName || home.name, awayName = fx.awayName || away.name;
    const slug = fx.homeId + '-vs-' + fx.awayId;  // URL 슬러그는 홈-원정 유지
    const swap = fx.awayId === 'south-korea';  // 대한민국은 무조건 왼쪽(앱 카드와 동일)
    const L = swap ? { t: away, name: awayName } : { t: home, name: homeName };
    const R = swap ? { t: home, name: homeName } : { t: away, name: awayName };
    const r = MR[fx.id];
    const data = {
      home: { name: L.name, flag: L.t.flag || '🏳️', rank: L.t.fifaRank },
      away: { name: R.name, flag: R.t.flag || '🏳️', rank: R.t.fifaRank },
      leftG: [], rightG: [],
    };
    if (r && (r.hs != null)) {
      data.ended = true; data.hs = swap ? r.as : r.hs; data.as = swap ? r.hs : r.as;
      (r.ev || []).forEach(ev => {
        const p = pbn(ev.who); if (!p) return;
        const team = ev.og ? (p.team === homeName ? awayName : homeName) : p.team;  // 자책골=상대팀 득점
        const surname = OG_OVERRIDE[p.id] || String(p.name || ev.who).split(' ').pop();
        (team === L.name ? data.leftG : data.rightG).push({ name: surname, clk: ev.clk, og: ev.og });
      });
    } else {
      data.ended = false;
      const grp = fx.group ? ' · ' + fx.group + '조' : (fx.stage ? ' · ' + fx.stage : '');
      data.dt = kstStr(fx) + grp;
    }
    items.push({ data, outPath: path.join(ROOT, 'ogm', slug + '.png') });
  });
  fs.mkdirSync(path.join(ROOT, 'ogm'), { recursive: true });
  await renderMany(items);
  console.log('OG 렌더 완료:', items.length, '장' + (only ? ' (' + only + ')' : '') + ' · 종료경기 결과반영:', items.filter(i => i.data.ended).length);
})();
