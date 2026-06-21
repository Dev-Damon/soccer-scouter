// FIFA 랭킹 최신화 — football-ranking.com(라이브 FIFA 랭킹 추적)에서 현재 순위를 가져와 data.js의 fifaRank 갱신.
// FIFA 공식 라이브 랭킹값과 동일(이 사이트가 공식 잠정 랭킹을 그대로 추적). 경기 끝나면 반영됨.
// 사용: node scripts/update_fifa.js [--dry]
const https = require('https'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data.js'), IDX = path.join(ROOT, 'index.html');
const DRY = process.argv.includes('--dry'), NODEPLOY = process.argv.includes('--no-deploy');
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
  if (!changes.length && !fjChanged) { console.log('변경 없음'); return; }
  if (NODEPLOY) { console.log('배포 생략(--no-deploy)'); return; }
  try {
    var gitFiles = ['fifa.json']; if (changes.length) gitFiles.push('data.js', 'index.html');
    execFileSync('git', ['add'].concat(gitFiles), { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'FIFA 랭킹 자동갱신: 순위 ' + changes.length + '팀' + (fjChanged ? ' · 포인트 갱신' : '')], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['-c', 'rebase.autoStash=true', 'pull', '--rebase', 'origin', 'main'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['push', 'origin', 'main'], { cwd: ROOT, stdio: 'ignore' });
    console.log('배포 완료');
  } catch (e) { console.log('배포 실패:', e.message); }
})();
