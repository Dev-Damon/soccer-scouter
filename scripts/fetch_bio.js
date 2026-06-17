// 선수 키·몸무게 자동수집 — ESPN 팀 로스터(48팀 전체 스쿼드)에서 (팀+등번호)로 우리 선수 매핑 → core API athlete bio(인치/파운드) → cm/kg → bio.json 갱신.
// 종료경기 무관, 전 스쿼드 커버. 사용: node scripts/fetch_bio.js
const https = require('https'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), BIOF = path.join(ROOT, 'bio.json');
function getJson(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{try{r(JSON.parse(d))}catch(e){r(null)}})}).on('error',()=>r(null))})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require(path.join(ROOT,'data.js')); const D=global.window.DATA;
const teamsById={}; D.teams.forEach(t=>teamsById[t.id]=t);
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim();}
const T_ALIAS={czechia:'czech-republic',korearepublic:'south-korea',usa:'united-states',turkiye:'turkey',caboverde:'cape-verde',cotedivoire:'ivory-coast',congodr:'dr-congo',bosniaherzegovina:'bosnia-and-herzegovina'};
function espnTeamId(nm){var s=norm(nm).replace(/ /g,'');var slug=norm(nm).replace(/ /g,'-');slug=T_ALIAS[s]||slug;return teamsById[slug]?slug:null;}
const byTeamNum={}; D.players.forEach(p=>{ if(p.number!=null) byTeamNum[p.team+'|'+p.number]=p.id; });
const TEAMS='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams';
const ROSTER=id=>'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/teams/'+id+'/roster';
const ATH='https://sports.core.api.espn.com/v2/sports/soccer/athletes/';
(async()=>{
  const tj=await getJson(TEAMS);
  const lg=((((tj||{}).sports||[])[0]||{}).leagues||[])[0]; const arr=((lg||{}).teams||[]).map(x=>x.team);
  console.log('ESPN 팀:',arr.length);
  const pidToAth={}; let rosterFail=0;
  for(const t of arr){
    const tid=espnTeamId(t.displayName); if(!tid){console.log('  팀매칭실패:',t.displayName);continue;}
    const tn=teamsById[tid].name;
    const rj=await getJson(ROSTER(t.id)); const ath=(rj||{}).athletes||[];
    if(!ath.length) rosterFail++;
    ath.forEach(a=>{ const j=a.jersey!=null?String(a.jersey):null; if(!j||!a.id)return; const pid=byTeamNum[tn+'|'+j]; if(pid&&!pidToAth[pid])pidToAth[pid]=a.id; });
    await sleep(60);
  }
  const pids=Object.keys(pidToAth); console.log('매핑된 선수:',pids.length,'| 로스터 빈 팀:',rosterFail);
  const bio={}; let ok=0,miss=0;
  for(const pid of pids){
    const a=await getJson(ATH+pidToAth[pid]); await sleep(80);
    if(!a){miss++;continue;}
    const hIn=parseFloat(a.height), wLb=parseFloat(a.weight);
    const h=hIn?Math.round(hIn*2.54):null, w=wLb?Math.round(wLb*0.453592):null;
    if(h||w){ bio[pid]={}; if(h)bio[pid].h=h; if(w)bio[pid].w=w; ok++; } else miss++;
  }
  console.log('bio 수집:',ok,'누락:',miss);
  let existing={}; try{ existing=JSON.parse(fs.readFileSync(BIOF,'utf8'))||{}; }catch(e){}
  Object.assign(existing,bio);
  const sorted={}; Object.keys(existing).sort().forEach(k=>sorted[k]=existing[k]);
  fs.writeFileSync(BIOF,JSON.stringify(sorted));
  console.log('bio.json 갱신 — 총',Object.keys(sorted).length,'명');
})();
