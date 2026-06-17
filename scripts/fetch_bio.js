// 선수 키·몸무게 자동수집 — ESPN 로스터(팀+등번호)로 우리 선수 매핑 → core API athlete bio(인치/파운드) → cm/kg 변환 → app.js PLAYER_BIO 마커 블록 갱신.
// 사용: node scripts/fetch_bio.js [eventId ...]  (인자 없으면 모든 종료경기 스캔). 경기 출전선수만 수집됨.
const https = require('https'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), APP = path.join(ROOT, 'app.js');
function getJson(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{r(JSON.parse(d))}catch(e){r(null)}})}).on('error',()=>r(null))})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require(path.join(ROOT,'data.js')); const D=global.window.DATA;
const teamsById={}; D.teams.forEach(t=>teamsById[t.id]=t);
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim();}
const T_ALIAS={czechia:'czech-republic',korearepublic:'south-korea',usa:'united-states',turkiye:'turkey',caboverde:'cape-verde',cotedivoire:'ivory-coast',congodr:'dr-congo',bosniaherzegovina:'bosnia-and-herzegovina'};
function espnTeamId(nm){var s=norm(nm).replace(/ /g,'');var slug=norm(nm).replace(/ /g,'-');slug=T_ALIAS[s]||slug;return teamsById[slug]?slug:null;}
// (teamName, number) -> our player id
const byTeamNum={}; D.players.forEach(p=>{ if(p.number!=null) byTeamNum[p.team+'|'+p.number]=p.id; });
const SCORE='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
const ATH='https://sports.core.api.espn.com/v2/sports/soccer/athletes/';

async function eventIds(){
  if(process.argv.length>2) return process.argv.slice(2);
  const ds=new Set(); D.fixtures.forEach(f=>{var d=(f.date||'').replace(/-/g,'');if(/^\d{8}$/.test(d)){ds.add(d);ds.add(String(+d-1));ds.add(String(+d+1));}});
  const ids=[];
  for(const dt of [...ds]){ var d=await getJson(SCORE+dt); (d&&d.events||[]).forEach(e=>{ if((((e.status||{}).type||{}).state)==='post') ids.push(e.id); }); await sleep(70); }
  return [...new Set(ids)];
}
(async()=>{
  const evs=await eventIds(); console.log('종료경기:',evs.length);
  const pidToAth={};  // ourPlayerId -> athleteId
  for(const eid of evs){
    const s=await getJson(SUM+eid); if(!s||!s.rosters){await sleep(60);continue;}
    s.rosters.forEach(r=>{ const tid=espnTeamId((r.team||{}).displayName); if(!tid)return; const tn=teamsById[tid].name;
      (r.roster||[]).forEach(e=>{ const j=e.jersey!=null?String(e.jersey):null; const aid=(e.athlete||{}).id; if(!j||!aid)return; const pid=byTeamNum[tn+'|'+j]; if(pid&&!pidToAth[pid])pidToAth[pid]=aid; });
    });
    await sleep(80);
  }
  const pids=Object.keys(pidToAth); console.log('매핑된 선수:',pids.length);
  const bio={}; let ok=0,miss=0;
  for(const pid of pids){
    const a=await getJson(ATH+pidToAth[pid]); await sleep(90);
    if(!a){miss++;continue;}
    const hIn=parseFloat(a.height), wLb=parseFloat(a.weight);
    const h=hIn?Math.round(hIn*2.54):null, w=wLb?Math.round(wLb*0.453592):null;
    if(h||w){ bio[pid]={}; if(h)bio[pid].h=h; if(w)bio[pid].w=w; ok++; } else miss++;
  }
  console.log('bio 수집:',ok,'누락:',miss);
  // app.js BIO 블록 병합 갱신
  // bio.json 병합 갱신(app.js 아님 — 경량화)
  const BIOF=path.join(ROOT,'bio.json');
  let existing={}; try{ existing=JSON.parse(fs.readFileSync(BIOF,'utf8'))||{}; }catch(e){}
  Object.assign(existing,bio);
  const sorted={}; Object.keys(existing).sort().forEach(k=>sorted[k]=existing[k]);
  fs.writeFileSync(BIOF,JSON.stringify(sorted));
  console.log('bio.json 갱신 — 총',Object.keys(sorted).length,'명');
})();
