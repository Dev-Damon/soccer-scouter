// 베팅 자동 정산: 종료된 WC 경기를 ESPN에서 찾아 settle_with_result RPC로 정산
// 공개 anon 키만 사용(PAT 불필요) → 예약 실행 가능. settle_with_result는 결과 먼저 쓴 사람이 이김(멱등).
const https = require('https');
const ANON = 'sb_publishable_AsDWJPjKDg1S5wqezB9Vtw';
function get(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))}).on('error',()=>r(''))})}
function rpc(name,body){return new Promise(r=>{var data=JSON.stringify(body);var req=https.request({hostname:'jhzchgvnkwdroxfrgjvm.supabase.co',path:'/rest/v1/rpc/'+name,method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))});req.on('error',()=>r('ERR'));req.write(data);req.end();})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require('../data.js'); const D=global.window.DATA;
const teamsById={}; D.teams.forEach(t=>teamsById[t.id]=t);
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim();}
const T_ALIAS={"czechia":"czech-republic","korearepublic":"south-korea","usa":"united-states","turkiye":"turkey"};
function espnTeam(nm){var s=norm(nm).replace(/ /g,'');var slug=norm(nm).replace(/ /g,'-');slug=T_ALIAS[s]||slug;return teamsById[slug]?slug:null;}
function findFixture(h,a){return D.fixtures.find(f=>f.homeId===h&&f.awayId===a)||D.fixtures.find(f=>f.homeId===a&&f.awayId===h);}
function ko(fx){try{return Date.parse((fx.kstDate||fx.date)+'T'+(fx.kstTime||fx.time||'00:00')+':00+09:00')||0;}catch(e){return 0;}}
const dates=[...new Set(D.fixtures.map(f=>(f.kstDate||f.date||'').replace(/-/g,'')).filter(Boolean))];
const allDates=new Set(); dates.forEach(d=>{allDates.add(d);var n=parseInt(d);allDates.add(String(n-1));allDates.add(String(n+1));});
// 최근 ±3일만 스캔(ESPN 부하↓) — 막 끝난 경기만 정산하면 됨
const NOW=Date.now();
const scanDates=[...allDates].filter(function(d){var t=Date.parse(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T12:00:00+09:00');return !isNaN(t)&&Math.abs(NOW-t)<3*86400000;});
(async()=>{
  const results=[], seen={};
  for(const dt of (scanDates.length?scanDates:[...allDates])){
    let d; try{d=JSON.parse(await get('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates='+dt))}catch(e){continue}
    (d.events||[]).forEach(e=>{
      if((((e.status||{}).type||{}).state)!=='post')return;
      var c=(e.competitions||[])[0]; if(!c)return; var comp=c.competitors||[];
      var hC=comp.find(x=>x.homeAway==='home'), aC=comp.find(x=>x.homeAway==='away'); if(!hC||!aC)return;
      var hId=espnTeam((hC.team||{}).displayName), aId=espnTeam((aC.team||{}).displayName);
      var fx=findFixture(hId,aId); if(!fx||seen[fx.id])return; seen[fx.id]=1;
      var hs=+hC.score, as=+aC.score;
      var ourHs=(fx.homeId===hId)?hs:as, ourAs=(fx.homeId===hId)?as:hs;
      results.push({match_id:fx.id, result:ourHs>ourAs?'home':ourHs<ourAs?'away':'draw', score:ourHs+'-'+ourAs, ko:ko(fx)});
    });
    await sleep(120);
  }
  if(!results.length){console.log('정산할 종료 경기 없음');return;}
  results.sort((a,b)=>a.ko-b.ko); // 시간순(연승 정확)
  console.log('정산 대상:', results.map(r=>r.match_id+'='+r.result+'('+r.score+')').join(', '));
  for(const r of results){ var out=await rpc('settle_with_result',{mid:r.match_id,res:r.result}); console.log(' '+r.match_id+'→'+String(out).slice(0,80)); await sleep(150); }
  console.log('정산 완료('+results.length+'경기)');
})();
