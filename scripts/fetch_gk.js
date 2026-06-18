// 골키퍼 국가대표 실점·무실점 자동수집 — 나무위키 선수 문서에서 "국가대표 N경기 M실점 [ref] K무실점" 추출 → gk.json.
// 사용: node scripts/fetch_gk.js [--test]  (--test = 앞 6명만)
const https = require('https'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), GKF = path.join(ROOT, 'gk.json');
const TEST = process.argv.includes('--test');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
function get(u){return new Promise(r=>{const req=https.get(u,{headers:{'User-Agent':UA,'Accept':'text/html'}},res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){return get(res.headers.location.startsWith('http')?res.headers.location:'https://namu.wiki'+res.headers.location).then(r);}let d='';res.on('data',c=>d+=c);res.on('end',()=>r({code:res.statusCode,body:d}))});req.on('error',()=>r({code:0,body:''}));req.setTimeout(25000,()=>{req.destroy();r({code:0,body:''})});})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require(path.join(ROOT,'data.js')); const D=global.window.DATA;
const isGK=p=>/gk/i.test(p.position||'')||String(p.position||'').includes('골키퍼');
let gks=D.players.filter(isGK);
if(TEST) gks=gks.slice(0,6);
function extract(html){
  // 각주 ref(&#91;N&#93; = [N])를 "8" 잔존 없이 통째 제거 먼저 → 숫자 간섭 방지
  const t=html.replace(/<[^>]+>/g,' ').replace(/&#91;\d+&#93;/g,' ').replace(/\[\d+\]/g,' ').replace(/&#?\w+;/g,' ').replace(/\s+/g,' ');
  // "국가대표 N경기 M실점 (K무실점)" — 구분자는 숫자 제외(스탯 숫자 안 먹게). 무실점 선택적. "국가대표팀(명단)"은 "팀"이라 안 걸림.
  const m=t.match(/국가대표[^가-힣0-9]{0,6}(\d{1,3})\s*경기[^가-힣0-9]{0,10}(\d{1,3})\s*실점(?:[^가-힣0-9]{0,14}(\d{1,3})\s*무실점)?/);
  if(m) return {g:+m[1], c:+m[2], cs:(m[3]!=null?+m[3]:null)};
  return null;
}
(async()=>{
  console.log('골키퍼:',gks.length);
  let existing={}; try{ existing=JSON.parse(fs.readFileSync(GKF,'utf8'))||{}; }catch(e){}
  let ok=0,miss=0;
  for(const p of gks){
    const url='https://namu.wiki/w/'+encodeURIComponent(p.name);
    const res=await get(url);
    if(res.code===200){
      const rec=extract(res.body);
      if(rec){ existing[p.id]=rec; ok++; console.log(' ✓',p.name,'('+p.team+'):',rec.g+'경기 '+rec.c+'실점 '+rec.cs+'무실점'); }
      else { miss++; console.log(' ·',p.name,'('+p.team+'): 기록패턴 없음'); }
    } else { miss++; console.log(' ✗',p.name,'HTTP',res.code); }
    await sleep(450);
  }
  const sorted={}; Object.keys(existing).sort().forEach(k=>sorted[k]=existing[k]);
  fs.writeFileSync(GKF,JSON.stringify(sorted));
  console.log('완료 — 수집:',ok,'누락:',miss,'/ gk.json 총',Object.keys(sorted).length,'명');
})();
