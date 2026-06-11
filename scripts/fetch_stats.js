const https = require('https'), fs = require('fs');
function get(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))}).on('error',()=>r(''))})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require('../data.js'); const D=global.window.DATA;
const teamsById={}; D.teams.forEach(t=>teamsById[t.id]=t);
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim();}
const byName={};
D.players.forEach(p=>{ if(!p.nameEn)return; var n=norm(p.nameEn); byName[n]=p; var parts=n.split(' '); if(parts.length>1){var sur='__sur_'+parts[parts.length-1]; if(!byName[sur])byName[sur]=p;} });
function matchPlayer(nm){ var n=norm(nm); if(byName[n])return byName[n]; return byName['__sur_'+n.split(' ').pop()]||null; }
const SCORE='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
// 인자: 날짜 목록(테스트용) 없으면 우리 fixtures 날짜
function pad(d){return d}
let DATES = process.argv.slice(2);
if(!DATES.length){ DATES=[...new Set(D.fixtures.map(f=>(f.kstDate||f.date||'').replace(/-/g,'')).filter(Boolean))]; }
(async()=>{
  const stats={};
  function rec(key,name,p){ return stats[key]||(stats[key]={key, name, teamId:p?p.team:null, goals:0,assists:0,og:0,yellow:0,red:0}); }
  function bump(nm, field){ var p=matchPlayer(nm); var k=p?p.id:('n:'+nm); rec(k, p?p.name:nm, p)[field]++; }
  const eids=new Set();
  for(const dt of DATES){ let d; try{d=JSON.parse(await get(SCORE+dt))}catch(e){continue} (d.events||[]).forEach(e=>{var st=((e.status||{}).type||{}).state; if(st==='post'||st==='in')eids.add(e.id);}); await sleep(110); }
  for(const eid of eids){
    let s; try{s=JSON.parse(await get(SUM+eid))}catch(e){continue}
    (s.keyEvents||[]).forEach(ev=>{
      var ty=((ev.type||{}).type||'').toLowerCase(), txt=(ev.shortText||ev.text||'');
      var parts=(ev.participants||ev.athletesInvolved||[]).map(a=>(a.athlete||{}).displayName).filter(Boolean);
      if(/own.?goal/.test(ty)||/own goal/i.test(txt)){ if(parts[0])bump(parts[0],'og'); }
      else if((/goal/.test(ty)||/penalty.*scored/.test(ty))&&!/missed|saved|disallow/.test(ty+txt.toLowerCase())){ if(parts[0])bump(parts[0],'goals'); if(parts[1])bump(parts[1],'assists'); }
      else if(/yellow.?card/.test(ty)){ if(parts[0])bump(parts[0],'yellow'); }
      else if(/red.?card/.test(ty)){ if(parts[0])bump(parts[0],'red'); }
    });
    await sleep(110);
  }
  const out=Object.values(stats).map(s=>{ var t=s.teamId&&teamsById[s.teamId]; return {name:s.name, team:t?t.name:'', flag:t?t.flag:'', pid:s.teamId?s.key:null, goals:s.goals, assists:s.assists, og:s.og, yellow:s.yellow, red:s.red}; });
  fs.writeFileSync('stats.json', JSON.stringify({players:out}));
  console.log('경기:',eids.size,'| 기록선수:',out.length);
  return out;
})();
