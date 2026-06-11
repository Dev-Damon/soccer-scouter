const https = require('https'), fs = require('fs');
function get(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))}).on('error',()=>r(''))})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require('../data.js'); const D=global.window.DATA;
const teamsById={}, teamsByName={}; D.teams.forEach(t=>{teamsById[t.id]=t; teamsByName[t.name]=t;});
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim();}
const byName={};
D.players.forEach(p=>{ if(!p.nameEn)return; var n=norm(p.nameEn); byName[n]=p; var parts=n.split(' '); if(parts.length>1){var sur='__sur_'+parts[parts.length-1]; if(!byName[sur])byName[sur]=p;} });
function matchPlayer(nm){ var n=norm(nm); if(byName[n])return byName[n]; return byName['__sur_'+n.split(' ').pop()]||null; }
// ESPN 팀명 → 우리 팀(국기) — 이름 매칭 안 된 선수도 국기는 붙게
const T_ALIAS={"czechia":"czech-republic","korearepublic":"south-korea","usa":"united-states","turkiye":"turkey","caboverde":"cape-verde","cotedivoire":"ivory-coast","congodr":"dr-congo","bosniaherzegovina":"bosnia-and-herzegovina"};
function espnTeam(nm){ var s=norm(nm).replace(/ /g,''); var slug=norm(nm).replace(/ /g,'-'); slug=T_ALIAS[s]||slug; return teamsById[slug]||null; }
const SCORE='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
// 인자: 날짜 목록(테스트용) 없으면 우리 fixtures 날짜
function pad(d){return d}
let DATES = process.argv.slice(2);
if(!DATES.length){ DATES=[...new Set(D.fixtures.map(f=>(f.kstDate||f.date||'').replace(/-/g,'')).filter(Boolean))]; }
(async()=>{
  const stats={};
  function rec(key,name,p){ return stats[key]||(stats[key]={key, name, teamId:p?p.team:null, flag:'', teamName:'', goals:0,assists:0,og:0,yellow:0,red:0,apps:0}); }
  function bump(nm, field, evTeam){ var p=matchPlayer(nm); var k=p?p.id:('n:'+nm); var r=rec(k, p?p.name:nm, p); r[field]++; if(!r.flag && evTeam){ r.flag=evTeam.flag; r.teamName=evTeam.name; } }
  const eids=new Set();
  for(const dt of DATES){ let d; try{d=JSON.parse(await get(SCORE+dt))}catch(e){continue} (d.events||[]).forEach(e=>{var st=((e.status||{}).type||{}).state; if(st==='post'||st==='in')eids.add(e.id);}); await sleep(110); }
  for(const eid of eids){
    let s; try{s=JSON.parse(await get(SUM+eid))}catch(e){continue}
    (s.keyEvents||[]).forEach(ev=>{
      var ty=((ev.type||{}).type||'').toLowerCase(), txt=(ev.shortText||ev.text||'');
      var parts=(ev.participants||ev.athletesInvolved||[]).map(a=>(a.athlete||{}).displayName).filter(Boolean);
      var evT=ev.team?espnTeam(ev.team.displayName):null;
      if(/own.?goal/.test(ty)||/own goal/i.test(txt)){ if(parts[0])bump(parts[0],'og'); }
      else if((/goal/.test(ty)||/penalty.*scored/.test(ty))&&!/missed|saved|disallow/.test(ty+txt.toLowerCase())){ if(parts[0])bump(parts[0],'goals',evT); if(parts[1])bump(parts[1],'assists',evT); }
      else if(/yellow.?card/.test(ty)){ if(parts[0])bump(parts[0],'yellow',evT); }
      else if(/red.?card/.test(ty)){ if(parts[0])bump(parts[0],'red',evT); }
    });
    // 출전 집계: 선발 + 교체 투입
    var appeared=new Set();
    (s.rosters||[]).forEach(rs=>{ (rs.roster||[]).forEach(pl=>{ if(pl.starter && pl.athlete && pl.athlete.displayName) appeared.add(pl.athlete.displayName); }); });
    (s.keyEvents||[]).forEach(ev=>{ if(/substitution/i.test((ev.type||{}).type||'')){ var inA=((ev.participants||[])[0]||{}).athlete; if(inA&&inA.displayName) appeared.add(inA.displayName); } });
    appeared.forEach(nm=>bump(nm,'apps'));
    await sleep(110);
  }
  const out=Object.values(stats).map(s=>{ var t=s.teamId&&teamsByName[s.teamId]; return {name:s.name, team:(t?t.name:s.teamName)||'', flag:(t?t.flag:s.flag)||'', pid:s.teamId?s.key:null, goals:s.goals, assists:s.assists, og:s.og, yellow:s.yellow, red:s.red, apps:s.apps}; });
  fs.writeFileSync('stats.json', JSON.stringify({players:out}));
  console.log('경기:',eids.size,'| 기록선수:',out.length);
  return out;
})();
