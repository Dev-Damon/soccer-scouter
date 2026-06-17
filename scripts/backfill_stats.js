// 일회성 백필: 모든 종료 WC 경기의 ESPN 경기통계(boxscore)+라인업을 DB(set_match_lineup)에 저장.
// 목적: 종료경기 통계를 ESPN이 삭제하기 전에 DB에 영구 보존 → 클라가 매번 ESPN 안 쳐도 됨.
// 통계(boxscore.teams>=2) 있는 것만 저장 → 빈 통계로 기존 좋은 데이터 덮어쓰지 않음.
const https = require('https'), path = require('path');
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoemNoZ3Zua3dkcm94ZnJnanZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjM1NDcsImV4cCI6MjA5NjU5OTU0N30.eRMPkzUO1aOd3s1R4-JnQQ912BhplhcO6qNut4Ro4Kg';
function get(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))}).on('error',()=>r(''))})}
function rpc(name,body){return new Promise(r=>{var data=JSON.stringify(body);var req=https.request({hostname:'jhzchgvnkwdroxfrgjvm.supabase.co',path:'/rest/v1/rpc/'+name,method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))});req.on('error',()=>r('ERR'));req.write(data);req.end();})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require(path.join(__dirname,'..','data.js')); const D=global.window.DATA;
const teamsById={}; D.teams.forEach(t=>teamsById[t.id]=t);
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ı/g,'i').replace(/ø/g,'o').replace(/ł/g,'l').replace(/đ/g,'d').replace(/ð/g,'d').replace(/æ/g,'ae').replace(/œ/g,'oe').replace(/ß/g,'ss').replace(/þ/g,'th').replace(/[^a-z ]/g,'').trim();}
const T_ALIAS={czechia:'czech-republic',korearepublic:'south-korea',usa:'united-states',turkiye:'turkey',caboverde:'cape-verde',cotedivoire:'ivory-coast',congodr:'dr-congo',bosniaherzegovina:'bosnia-and-herzegovina'};
function espnTeam(nm){var s=norm(nm).replace(/ /g,'');var slug=norm(nm).replace(/ /g,'-');slug=T_ALIAS[s]||slug;return teamsById[slug]||null;}
const fixByPair={}; D.fixtures.forEach(f=>{if(f.homeId&&f.awayId)fixByPair[[f.homeId,f.awayId].sort().join('|')]=f.id;});
const SCORE='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
(async()=>{
  // 모든 fixture UTC 날짜 ±1일 수집
  const ds=new Set();
  D.fixtures.forEach(f=>{var d=(f.date||'').replace(/-/g,'');if(/^\d{8}$/.test(d)){ds.add(d);var n=+d;ds.add(String(n-1));ds.add(String(n+1));}});
  const posts={};  // fid -> eid
  for(const dt of [...ds]){
    var raw=await get(SCORE+dt),d; try{d=JSON.parse(raw)}catch(e){continue}
    (d.events||[]).forEach(e=>{
      if((((e.status||{}).type||{}).state)!=='post')return;
      var c=(e.competitions||[])[0]; if(!c)return; var comp=c.competitors||[];
      var H=comp.find(x=>x.homeAway==='home'),A=comp.find(x=>x.homeAway==='away'); if(!H||!A)return;
      var hT=espnTeam((H.team||{}).displayName),aT=espnTeam((A.team||{}).displayName); if(!hT||!aT)return;
      var fid=fixByPair[[hT.id,aT.id].sort().join('|')]; if(!fid)return;
      posts[fid]=e.id;
    });
    await sleep(80);
  }
  const fids=Object.keys(posts);
  console.log('종료경기 발견:',fids.length);
  let saved=0,skip=0;
  for(const fid of fids){
    var s; try{s=JSON.parse(await get(SUM+posts[fid]))}catch(e){skip++;continue}
    var bs=((s||{}).boxscore||{}).teams||[];
    var hasStarters=((s||{}).rosters||[]).some(r=>(r.roster||[]).some(x=>x.starter));
    if(bs.length>=2 && hasStarters){
      var out=await rpc('set_match_lineup',{mid:fid,d:{rosters:s.rosters,keyEvents:s.keyEvents,header:s.header,headToHeadGames:s.headToHeadGames,boxscore:s.boxscore}});
      console.log(' ',fid,'저장(boxscore teams '+bs.length+')',String(out).slice(0,40));
      saved++;
    } else { console.log(' ',fid,'스킵(통계없음 bs='+bs.length+' starters='+hasStarters+')'); skip++; }
    await sleep(150);
  }
  console.log('백필 완료 — 저장:',saved,'스킵:',skip);
})();
