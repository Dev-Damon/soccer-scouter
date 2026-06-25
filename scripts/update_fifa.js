// FIFA 랭킹 최신화 — football-ranking.com(라이브 FIFA 랭킹 추적)에서 현재 순위를 가져와 data.js의 fifaRank 갱신.
// FIFA 공식 라이브 랭킹값과 동일(이 사이트가 공식 잠정 랭킹을 그대로 추적). 경기 끝나면 반영됨.
// 사용: node scripts/update_fifa.js [--dry]
const https = require('https'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data.js'), IDX = path.join(ROOT, 'index.html');
const DRY = process.argv.includes('--dry'), NODEPLOY = process.argv.includes('--no-deploy'), FORCE = process.argv.includes('--force');
// 이벤트 기반 게이트: 라이브데이터(ESPN)로 '끝난 경기'를 감지해, 종료 관측 후 1시간 지난 미처리 경기가 있을 때만 실제 갱신.
// 연장·승부차기로 종료시각이 제각각이라 킥오프+시간 추정 대신 실제 state=post로 판정. 평소엔 스크랩/커밋 안 함(노이즈 제거).
const ESPN_SB = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
const STATE = path.join(ROOT, '.fifa_state.json');
const DELAY_MS = 60 * 60 * 1000;            // 종료 관측 후 1시간 버퍼(football-ranking.com 반영 시차)
const MAX_STALE_MS = 24 * 60 * 60 * 1000;   // 경기 없어도 24h마다 1회(공식 랭킹 발표·휴식일 대비)
const PRUNE_MS = 3 * 24 * 60 * 60 * 1000;   // 상태파일 3일 지난 항목 정리
function loadState(){ try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return { observed: {}, processed: {}, lastRun: 0 }; } }
function saveState(s){ try { fs.writeFileSync(STATE, JSON.stringify(s)); } catch (e) {} }
function pruneState(s){ var now = Date.now(); [s.observed, s.processed].forEach(function (o) { Object.keys(o || {}).forEach(function (k) { if (now - o[k] > PRUNE_MS) delete o[k]; }); }); }
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605';
function get(u){return new Promise((res,rej)=>{https.get(u,{headers:{'User-Agent':UA}},r=>{if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){return get(r.headers.location).then(res,rej);}let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
// FIFA 3글자 코드 → 우리 teamId (2026 본선 48개국)
const CODE_TO_ID = {
  MEX:'mexico', RSA:'south-africa', KOR:'south-korea', CZE:'czech-republic', CAN:'canada', BIH:'bosnia-and-herzegovina',
  QAT:'qatar', SUI:'switzerland', BRA:'brazil', MAR:'morocco', HAI:'haiti', SCO:'scotland', USA:'united-states',
  PAR:'paraguay', AUS:'australia', TUR:'turkey', GER:'germany', CUW:'curacao', CIV:'ivory-coast', ECU:'ecuador',
  NED:'netherlands', JPN:'japan', SWE:'sweden', TUN:'tunisia', BEL:'belgium', EGY:'egypt', IRN:'iran', NZL:'new-zealand',
  ESP:'spain', CPV:'cape-verde', KSA:'saudi-arabia', URU:'uruguay', FRA:'france', SEN:'senegal', IRQ:'iraq', NOR:'norway',
  ARG:'argentina', ALG:'algeria', AUT:'austria', JOR:'jordan', POR:'portugal', COD:'dr-congo', UZB:'uzbekistan',
  COL:'colombia', ENG:'england', CRO:'croatia', GHA:'ghana', PAN:'panama'
};
function cells(r){return (r.match(/<td[\s\S]*?<\/td>/g)||[]).map(c=>c.replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim());}
(async()=>{
  // ── 게이트키퍼: 새로 끝난 경기가 1시간 경과했을 때만 진행 ──
  var _state = loadState(), _postIds = [];
  function finalize(){ if (DRY || FORCE) return; var now = Date.now(); _postIds.forEach(function (id) { _state.processed[id] = now; }); _state.lastRun = now; pruneState(_state); saveState(_state); }
  if (!DRY && !FORCE) {
    var now = Date.now(), due = false;
    try {
      var sb = JSON.parse(await get(ESPN_SB));
      (sb.events || []).forEach(function (e) { var st = e.status && e.status.type && e.status.type.state; if (st === 'post') { _postIds.push(e.id); if (!_state.observed[e.id]) _state.observed[e.id] = now; } });
    } catch (e) { console.log('스코어보드 조회 실패:', e.message); }  // 실패 시 due 판정은 24h 안전판만
    _postIds.forEach(function (id) { if (_state.observed[id] && (now - _state.observed[id] >= DELAY_MS) && !_state.processed[id]) due = true; });  // 종료 1h 경과 미처리 경기
    if (now - (_state.lastRun || 0) >= MAX_STALE_MS) due = true;  // 24h 무갱신 안전판
    if (!due) { pruneState(_state); saveState(_state); console.log('스킵: 새로 종료된(1시간 경과) 경기 없음'); return; }
    console.log('트리거: 종료 경기 갱신 진행 (post', _postIds.length, '경기)');
  }
  // 페이지네이션(페이지당 50팀) — 전체 FIFA 회원국까지 저장하고, 본선 48개국은 data.js에도 반영.
  const rankByCode = {}, ptsByCode = {}, chByCode = {}, chRByCode = {}, allByCode = {};
  for (var pg = 1; pg <= 5; pg++) {
    const h = await get('https://football-ranking.com/fifa-rankings?page=' + pg);
    const rows = h.match(/<tr[\s\S]*?<\/tr>/g) || [];
    var n0 = Object.keys(rankByCode).length;
    rows.forEach(r=>{
      const c = cells(r); if (c.length < 2) return;
      const rk = parseInt((c[0]||'').match(/^\s*(\d+)/)); const cm = (c[1]||'').match(/\(([A-Z]{3})\)/);
      if (rk && cm) {
        const code = cm[1], name = (c[1] || '').replace(/\([A-Z]{3}\)/, '').trim();
        const im = r.match(/<img[^>]+src="([^"]+)"/);
        rankByCode[code] = rk;
        const rt = c.join(' ');
        const pm = rt.match(/([\d,]+\.\d+)/); if (pm) ptsByCode[code] = parseFloat(pm[1].replace(/,/g, ''));  // 포인트(첫 소수)
        const chm = rt.match(/\(([+\-]\d+(?:\.\d+)?)\)/); if (chm) chByCode[code] = parseFloat(chm[1]);  // 포인트 증감 (+/-)
        const rkm = rt.match(/(↑|↓)\s*(\d+)/); if (rkm) chRByCode[code] = (rkm[1] === '↑' ? 1 : -1) * parseInt(rkm[2]);  // 순위 변동 (↑N/↓N)
        allByCode[code] = { code, name, flagUrl: im ? im[1] : '', r: rk };
      }
    });
    if (Object.keys(rankByCode).length === n0) break;  // 새 항목 없으면 마지막 페이지
  }
  if (Object.keys(rankByCode).length < 50) { console.log('파싱 실패(행', Object.keys(rankByCode).length, ')'); process.exit(1); }
  let src = fs.readFileSync(DATA, 'utf8');
  const changes = []; const missing = [];
  Object.keys(CODE_TO_ID).forEach(code=>{
    const id = CODE_TO_ID[code], nr = rankByCode[code];
    if (nr == null) { missing.push(code + '(' + id + ')'); return; }
    // 해당 팀 객체 내 fifaRank만 교체("id":"<id>" 뒤 가장 가까운 fifaRank)
    const re = new RegExp('("id":\\s*"' + id + '"[\\s\\S]{0,400}?"fifaRank":\\s*)(\\d+)');
    const m = src.match(re);
    if (!m) { missing.push(code + '(no match ' + id + ')'); return; }
    if (+m[2] !== nr) { changes.push(id + ' ' + m[2] + '→' + nr); src = src.replace(re, '$1' + nr); }
  });
  console.log('갱신:', changes.length, '경기/누락:', missing.length);
  if (changes.length) console.log(' ', changes.join(', '));
  if (missing.length) console.log(' 누락(라이브표 밖 or 코드불일치):', missing.join(', '));
  if (DRY) { console.log('[dry] 미적용'); process.exit(0); }
  // fifa.json — 순위+포인트+증감({r,p,ch}). 포인트는 매경기 변동되므로 랭크 무변동이어도 갱신. 토스/웹 공통 런타임 fetch.
  const fmap = { _ts: Date.now() };  // 갱신 시각
  Object.keys(CODE_TO_ID).forEach(code => { const id = CODE_TO_ID[code]; if (rankByCode[code] != null) fmap[id] = { r: rankByCode[code], p: ptsByCode[code] != null ? ptsByCode[code] : null, ch: chByCode[code] != null ? chByCode[code] : 0, chR: chRByCode[code] != null ? chRByCode[code] : 0 }; });
  fmap._all = Object.keys(allByCode).map(code => {
    const row = allByCode[code];
    return { code: row.code, name: row.name, flagUrl: row.flagUrl, id: CODE_TO_ID[code] || null, r: row.r, p: ptsByCode[code] != null ? ptsByCode[code] : null, ch: chByCode[code] != null ? chByCode[code] : 0, chR: chRByCode[code] != null ? chRByCode[code] : 0 };
  }).sort((a, b) => a.r - b.r);
  const fjPath = path.join(ROOT, 'fifa.json'), newFj = JSON.stringify(fmap, null, 1);
  const fjChanged = newFj !== (fs.existsSync(fjPath) ? fs.readFileSync(fjPath, 'utf8') : '');
  if (fjChanged) fs.writeFileSync(fjPath, newFj);
  if (changes.length) {
    fs.writeFileSync(DATA, src);
    var idx = fs.readFileSync(IDX, 'utf8').replace(/data\.js\?v=[^"]*/, 'data.js?v=f' + Date.now());
    fs.writeFileSync(IDX, idx);
  }
  if (!changes.length && !fjChanged) { console.log('변경 없음'); finalize(); return; }  // 이번 경기 wave 처리완료로 기록(재트리거 방지)
  if (NODEPLOY) { console.log('배포 생략(--no-deploy)'); finalize(); return; }
  try {
    var gitFiles = ['fifa.json']; if (changes.length) gitFiles.push('data.js', 'index.html');
    execFileSync('git', ['add'].concat(gitFiles), { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'FIFA 랭킹 자동갱신: 순위 ' + changes.length + '팀' + (fjChanged ? ' · 포인트 갱신' : '')], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['-c', 'rebase.autoStash=true', 'pull', '--rebase', 'origin', 'main'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['push', 'origin', 'main'], { cwd: ROOT, stdio: 'ignore' });
    console.log('배포 완료');
  } catch (e) { console.log('배포 실패:', e.message); }
  finalize();  // 성공적으로 스크랩·갱신했으면 이번 wave 처리완료 기록 + lastRun 갱신
})();
