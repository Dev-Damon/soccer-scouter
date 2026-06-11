// 수동 정산: 종료된 WC 경기를 ESPN에서 찾아 match_results 기록 + settle_match 호출
// 실행: SUPABASE_PAT=xxx node scripts/settle.js   (PAT 없으면 SQL만 출력)
const https = require('https');
function get(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))}).on('error',()=>r(''))})}
function post(p,body){return new Promise(r=>{var data=JSON.stringify(body);var req=https.request({hostname:'api.supabase.com',path:p,method:'POST',headers:{'Authorization':'Bearer '+process.env.SUPABASE_PAT,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))});req.write(data);req.end();})}
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
(async()=>{
  const results=[], seen={};
  for(const dt of allDates){
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
  var sql=results.map(r=>`insert into match_results(match_id,result) values('${r.match_id}','${r.result}') on conflict (match_id) do nothing;`).join('\n')+'\n'+results.map(r=>`select settle_match('${r.match_id}');`).join('\n');
  console.log('정산 대상:', results.map(r=>r.match_id+'='+r.result+'('+r.score+')').join(', '));
  if(!process.env.SUPABASE_PAT){console.log('--- PAT 없음, SQL만 ---\n'+sql);return;}
  console.log('정산 실행:', (await post('/v1/projects/jhzchgvnkwdroxfrgjvm/database/query',{query:sql})).slice(0,400));
})();
