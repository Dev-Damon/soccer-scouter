// 정적 콘텐츠 페이지 생성기 — data.js로 나라별/경기별 HTML을 뽑아 검색·애드센스 크롤러가 읽을 실제 콘텐츠 제공.
// 앱(SPA)은 그대로 두고 추가 파일만 생성: /t/<teamId>.html, /m/<matchId>.html, sitemap.xml.
// 사용: node scripts/gen_static.js [teamId]   (인자 주면 그 팀만, 없으면 전체)
const fs = require('fs'), path = require('path');
global.window = {}; require(path.join(__dirname, '..', 'data.js')); const D = global.window.DATA;
const ROOT = path.dirname(__dirname);
const SITE = 'https://kicktalk.xyz';
const ADSENSE = 'ca-pub-1649642792791162';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const teamsById = {}; D.teams.forEach(t => teamsById[t.id] = t);
const playersByTeam = {}; D.players.forEach(p => { (playersByTeam[p.team] = playersByTeam[p.team] || []).push(p); });

// 공통 <head> — 메타·OG·테마·애드센스·스타일
function head(o) {
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
    '<title>' + esc(o.title) + '</title>' +
    '<meta name="description" content="' + esc(o.desc) + '" />' +
    '<link rel="canonical" href="' + esc(o.canonical) + '" />' +
    '<meta property="og:type" content="' + (o.ogType || 'article') + '" />' +
    '<meta property="og:title" content="' + esc(o.title) + '" />' +
    '<meta property="og:description" content="' + esc(o.desc) + '" />' +
    '<meta property="og:url" content="' + esc(o.canonical) + '" />' +
    '<meta property="og:site_name" content="킥톡 KickTalk" />' +
    '<link rel="icon" type="image/svg+xml" href="' + SITE + '/icon.svg" />' +
    '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + ADSENSE + '" crossorigin="anonymous"></script>' +
    '<script>try{if(localStorage.getItem("kt_theme")!=="dark")document.documentElement.classList.add("light");}catch(e){}</script>' +
    '<style>' + CSS + '</style></head>';
}
const CSS = ':root{--bg:#0b1220;--line:#1e2a3a;--text:#e8eef6;--muted:#9fb0c3;--accent:#2ee6a6;--card:#131c2e;--soft:#0f1727}' +
  'html.light{--bg:#f3f5f8;--line:#e3e8f0;--text:#1c2536;--muted:#62718c;--accent:#2f6fe0;--card:#fff;--soft:#f6f8fb}' +
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"Apple SD Gothic Neo",system-ui,-apple-system,sans-serif;line-height:1.7;-webkit-text-size-adjust:100%}' +
  '.wrap{max-width:820px;margin:0 auto;padding:20px 16px 64px}' +
  'a{color:var(--accent)}' +
  'header{display:flex;align-items:center;gap:10px;padding:4px 0 14px;border-bottom:1px solid var(--line);margin-bottom:20px}' +
  '.brand{font-weight:800;font-size:17px;text-decoration:none;color:var(--text)}header .home{margin-left:auto;font-size:13px;text-decoration:none}' +
  '.hero{display:flex;align-items:center;gap:14px;margin-bottom:8px}.hero .fl{font-size:46px;line-height:1}' +
  'h1{font-size:24px;margin:0}.en{color:var(--muted);font-size:14px;font-weight:600}' +
  '.meta{color:var(--muted);font-size:13px;margin:2px 0 16px}.meta b{color:var(--text)}' +
  '.lead{font-size:15px;margin:0 0 18px}' +
  'h2{font-size:18px;margin:26px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--line)}' +
  '.idx{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}' +
  '.ib{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px}' +
  '.ib .k{font-size:12px;color:var(--muted)}.ib .bar{height:7px;background:var(--soft);border-radius:4px;margin-top:6px;overflow:hidden}.ib .bar i{display:block;height:100%;background:var(--accent)}.ib .v{font-size:13px;font-weight:800;float:right}' +
  'ul.style{margin:0;padding-left:18px}ul.style li{margin:4px 0}' +
  '.pl{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:11px}' +
  '.pl-h{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.pl-no{font-weight:800;color:var(--accent);min-width:24px}' +
  '.pl-nm{font-size:16px;font-weight:800}.pl-en{color:var(--muted);font-size:12px}.pl-ovr{margin-left:auto;font-size:12px;font-weight:800;background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:2px 8px}' +
  '.pl-sub{color:var(--muted);font-size:12.5px;margin:3px 0 7px}.pl-one{font-size:14px;margin:0 0 7px}' +
  '.tags{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0}.tag{font-size:11.5px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);background:var(--soft);color:var(--muted)}.tag.s{color:#2ee6a6;border-color:rgba(46,230,166,.4)}.tag.w{color:#ff8a8a;border-color:rgba(255,120,120,.35)}' +
  '.hon{font-size:12.5px;color:var(--muted);margin:5px 0 0;padding-left:16px}.hon li{margin:2px 0}' +
  '.applink{display:inline-block;margin:8px 0 4px;background:var(--accent);color:#06231a;font-weight:800;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px}' +
  'html.light .applink{color:#fff}' +
  '.news{margin:0;padding:0;list-style:none}.news li{padding:10px 0;border-bottom:1px solid var(--line)}.news a{font-weight:700;text-decoration:none;font-size:14px}.news .ns{color:var(--muted);font-size:12.5px;margin-top:3px}' +
  '.others{display:flex;flex-wrap:wrap;gap:6px}.others a{font-size:13px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 9px;text-decoration:none;color:var(--text)}' +
  '.foot{margin-top:30px;color:var(--muted);font-size:12.5px;border-top:1px solid var(--line);padding-top:14px}' +
  '.ad{margin:18px 0;min-height:90px}';

function bar(label, v) {
  return '<div class="ib"><span class="v">' + (v | 0) + '</span><div class="k">' + esc(label) + '</div><div class="bar"><i style="width:' + Math.min(100, v | 0) + '%"></i></div></div>';
}

function teamPage(t) {
  var ps = (playersByTeam[t.name] || []).slice().sort((a, b) => (+a.number || 99) - (+b.number || 99));
  var canonical = SITE + '/t/' + t.id + '.html';
  var appUrl = SITE + '/#team/' + t.id;
  var i = t.indices || {};
  var desc = (t.tierSummary || (t.name + ' 2026 월드컵 선수단·전력 분석')).slice(0, 155);

  var players = ps.map(function (p) {
    var sub = [p.position, p.club, (p.age != null ? p.age + '세' : ''), (p.caps != null ? 'A매치 ' + p.caps + '경기' : ''), (p.intlGoals != null ? p.intlGoals + '골' : '')].filter(Boolean).map(esc).join(' · ');
    var st = (p.strengths || []).map(function (s) { return '<span class="tag s">+ ' + esc(s) + '</span>'; }).join('');
    var wk = (p.weaknesses || []).map(function (s) { return '<span class="tag w">– ' + esc(s) + '</span>'; }).join('');
    var hon = (p.honours || []).length ? '<ul class="hon">' + p.honours.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul>' : '';
    var tr = p.notableTransfer ? '<div class="pl-sub">📌 ' + esc(p.notableTransfer) + '</div>' : '';
    return '<div class="pl"><div class="pl-h"><span class="pl-no">' + (p.number != null ? esc(p.number) : '') + '</span>' +
      '<span class="pl-nm">' + esc(p.name) + '</span><span class="pl-en">' + esc(p.nameEn || '') + '</span>' +
      (p.ovr != null ? '<span class="pl-ovr">OVR ' + esc(p.ovr) + '</span>' : '') + '</div>' +
      '<div class="pl-sub">' + sub + (p.grade ? ' · <b>' + esc(p.grade) + '</b>' : '') + '</div>' +
      (p.oneLiner ? '<p class="pl-one">' + esc(p.oneLiner) + '</p>' : '') +
      (st || wk ? '<div class="tags">' + st + wk + '</div>' : '') + hon + tr + '</div>';
  }).join('');

  var news = (t.news || []).slice(0, 6).map(function (n) {
    return '<li><a href="' + esc(n.url || '#') + '" target="_blank" rel="noopener nofollow">' + esc(n.title) + '</a>' +
      (n.summary ? '<div class="ns">' + esc(n.summary) + '</div>' : '') + '</li>';
  }).join('');

  var others = D.teams.slice().sort((a, b) => (a.fifaRank || 999) - (b.fifaRank || 999)).map(function (o) {
    return '<a href="' + SITE + '/t/' + o.id + '.html">' + esc(o.flag) + ' ' + esc(o.name) + '</a>';
  }).join('');

  return head({ title: t.name + ' 축구 국가대표팀 — 2026 월드컵 선수단·전력 분석 | 킥톡', desc: desc, canonical: canonical, ogType: 'profile' }) +
    '<body><div class="wrap">' +
    '<header><a class="brand" href="' + SITE + '/">⚽ 킥톡 KickTalk</a><a class="home" href="' + SITE + '/">앱 홈 →</a></header>' +
    '<div class="hero"><span class="fl">' + esc(t.flag) + '</span><div><h1>' + esc(t.name) + '</h1><span class="en">' + esc(t.nameEn || '') + ' 국가대표팀</span></div></div>' +
    '<div class="meta">FIFA 랭킹 <b>' + esc(t.fifaRank) + '위</b> · <b>' + esc(t.group) + '조</b>' + (t.manager && t.manager.name ? ' · 감독 <b>' + esc(t.manager.name) + '</b>' : '') + (t.lastWc ? ' · 지난 월드컵 <b>' + esc(t.lastWc.year) + ' ' + esc(t.lastWc.stage) + '</b>' : '') + '</div>' +
    (t.tierSummary ? '<p class="lead">' + esc(t.tierSummary) + '</p>' : '') +
    '<a class="applink" href="' + appUrl + '">📱 킥톡 앱에서 실시간 경기·라인업 보기</a>' +
    '<div class="ad"><ins class="adsbygoogle" style="display:block" data-ad-client="' + ADSENSE + '" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>' +
    (Array.isArray(t.styleSummary) && t.styleSummary.length ? '<h2>플레이 스타일</h2><ul class="style">' + t.styleSummary.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '') +
    '<h2>전력 지표</h2><div class="idx">' + bar('공격력', i.attack) + bar('수비력', i.defense) + bar('조직력', i.organization) + bar('경험치', i.experience) + '</div>' +
    '<h2>선수단 (' + ps.length + '명)</h2>' + players +
    (news ? '<h2>주요 뉴스</h2><ul class="news">' + news + '</ul>' : '') +
    '<h2>다른 참가국</h2><div class="others">' + others + '</div>' +
    '<div class="foot">이 페이지는 킥톡 KickTalk의 ' + esc(t.name) + ' 대표팀 정보 요약입니다. 실시간 경기·라인업·선수 평점은 <a href="' + appUrl + '">킥톡 앱</a>에서 확인하세요.<br>킥톡 KickTalk · 2026 월드컵 비공식 · 정보는 참고용 · <a href="' + SITE + '/terms.html">서비스 약관</a> · <a href="' + SITE + '/privacy.html">개인정보처리방침</a></div>' +
    '</div></body></html>';
}

// === 실행 ===
var only = process.argv[2];
var dir = path.join(ROOT, 't'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
var targets = only ? D.teams.filter(t => t.id === only) : D.teams;
targets.forEach(function (t) {
  fs.writeFileSync(path.join(dir, t.id + '.html'), teamPage(t));
});
console.log('생성 완료:', targets.length, '개 팀 페이지 →', only ? ('t/' + only + '.html') : 't/');
