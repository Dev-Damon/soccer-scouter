const https = require('https'), fs = require('fs');
function get(url){return new Promise((res)=>{https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d))}).on('error',()=>res(''))})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require('../data.js'); const D=global.window.DATA;
const teamsById={}; D.teams.forEach(t=>teamsById[t.id]=t);
const ALIAS={"czechia":"czech-republic","turkiye":"turkey","cabo-verde":"cape-verde","cote-divoire":"ivory-coast","cotedivoire":"ivory-coast","usa":"united-states","korea-republic":"south-korea","congo-dr":"dr-congo","bosnia-herzegovina":"bosnia-and-herzegovina"};
function espnSlug(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/['.]/g,'').replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function espnTeamId(name){let s=espnSlug(name);s=ALIAS[s]||s;return teamsById[s]?s:null}
const groupFx=D.fixtures.filter(f=>f.homeId&&f.awayId&&teamsById[f.homeId]&&teamsById[f.awayId]&&(f.group||/group|조/i.test(f.stage||'')));
const pairToFx={}; groupFx.forEach(f=>{pairToFx[[f.homeId,f.awayId].sort().join('|')]=f.id});
const dates=[...new Set(groupFx.map(f=>(f.kstDate||f.date||'').replace(/-/g,'')).filter(Boolean))];
const SCORE='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
(async()=>{
  console.log('조별 경기:',groupFx.length,'| 날짜:',dates.length);
  const fxToEid={};
  for(const dt of dates){
    let d; try{d=JSON.parse(await get(SCORE+dt))}catch(e){continue}
    (d.events||[]).forEach(e=>{const c=(e.competitions||[])[0];if(!c)return;const comp=c.competitors||[];const H=comp.find(t=>t.homeAway==='home')||comp[0],A=comp.find(t=>t.homeAway==='away')||comp[1];if(!H||!A)return;const hid=espnTeamId(H.team&&H.team.displayName),aid=espnTeamId(A.team&&A.team.displayName);if(!hid||!aid)return;const fid=pairToFx[[hid,aid].sort().join('|')];if(fid)fxToEid[fid]=e.id});
    await sleep(150);
  }
  console.log('이벤트 매칭:',Object.keys(fxToEid).length);
  const out={};
  for(const [fid,eid] of Object.entries(fxToEid)){
    try{const s=JSON.parse(await get(SUM+eid));if(s.headToHeadGames&&s.headToHeadGames.length)out[fid]={eid,h2h:s.headToHeadGames}}catch(e){}
    await sleep(120);
  }
  fs.writeFileSync('h2h.json',JSON.stringify(out));
  console.log('✓ h2h.json:',Object.keys(out).length,'경기 H2H 저장,',(JSON.stringify(out).length/1024|0),'KB');
})();
