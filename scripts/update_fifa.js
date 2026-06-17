// FIFA 랭킹 최신화 — football-ranking.com(라이브 FIFA 랭킹 추적)에서 현재 순위를 가져와 data.js의 fifaRank 갱신.
// FIFA 공식 라이브 랭킹값과 동일(이 사이트가 공식 잠정 랭킹을 그대로 추적). 경기 끝나면 반영됨.
// 사용: node scripts/update_fifa.js [--dry]
const https = require('https'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DATA = path.join(ROOT, 'data.js');
const DRY = process.argv.includes('--dry');
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
(async()=>{
  const h = await get('https://football-ranking.com/fifa-world-rankings');
  const rows = h.match(/<tr[\s\S]*?<\/tr>/g) || [];
  function cells(r){return (r.match(/<td[\s\S]*?<\/td>/g)||[]).map(c=>c.replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim());}
  const rankByCode = {};
  rows.forEach(r=>{
    const c = cells(r); if (c.length < 2) return;
    const rk = parseInt((c[0]||'').match(/\d+/)); const cm = (c[1]||'').match(/\(([A-Z]{3})\)/);
    if (rk && cm) rankByCode[cm[1]] = rk;
  });
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
  if (changes.length) fs.writeFileSync(DATA, src);
})();
