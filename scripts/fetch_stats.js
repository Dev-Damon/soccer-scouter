const https = require('https'), fs = require('fs');
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoemNoZ3Zua3dkcm94ZnJnanZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjM1NDcsImV4cCI6MjA5NjU5OTU0N30.eRMPkzUO1aOd3s1R4-JnQQ912BhplhcO6qNut4Ro4Kg';  // 레거시 anon JWT(RLS 보호·공개안전) — 직접 REST는 publishable키 안 받음
function get(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))}).on('error',()=>r(''))})}
function rpc(name,body){return new Promise(r=>{var data=JSON.stringify(body);var req=https.request({hostname:'jhzchgvnkwdroxfrgjvm.supabase.co',path:'/rest/v1/rpc/'+name,method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))});req.on('error',()=>r('ERR'));req.write(data);req.end();})}
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
if(!DATES.length){
  // ESPN scoreboard는 UTC 날짜 기준 → KST 경기일 ±1일도 같이 스캔(안 그러면 자정 넘는 경기 누락)
  var base=[...new Set(D.fixtures.map(f=>(f.kstDate||f.date||'').replace(/-/g,'')).filter(Boolean))];
  var s=new Set(); base.forEach(d=>{ s.add(d); var n=parseInt(d,10); s.add(String(n-1)); s.add(String(n+1)); });
  DATES=[...s];
}
function findFixture(h,a){return D.fixtures.find(f=>f.homeId===h&&f.awayId===a)||D.fixtures.find(f=>f.homeId===a&&f.awayId===h);}
(async()=>{
  const stats={};  // 전체 누적(stats.json 폴백)
  function rec(key,name){ return stats[key]||(stats[key]={key, name, flag:'', teamName:'', goals:0,assists:0,og:0,yellow:0,red:0,apps:0}); }
  // eid → 우리 match_id 매핑(경기별 행 키)
  const eidToMatch={};
  for(const dt of DATES){
    let d; try{d=JSON.parse(await get(SCORE+dt))}catch(e){continue}
    (d.events||[]).forEach(e=>{
      var st=((e.status||{}).type||{}).state; if(st!=='post'&&st!=='in')return;
      var c=(e.competitions||[])[0]; if(!c)return; var comp=c.competitors||[];
      var hC=comp.find(x=>x.homeAway==='home'),aC=comp.find(x=>x.homeAway==='away'); if(!hC||!aC)return;
      var hT=espnTeam((hC.team||{}).displayName),aT=espnTeam((aC.team||{}).displayName);
      var fx=(hT&&aT)?findFixture(hT.id,aT.id):null; if(fx) eidToMatch[e.id]=fx.id;
    });
    await sleep(110);
  }
  const eids=Object.keys(eidToMatch);
  for(const eid of eids){
    let s; try{s=JSON.parse(await get(SUM+eid))}catch(e){continue}
    const m={};  // 이 경기만
    function mbump(nm,field,evTeam){ var p=matchPlayer(nm); var k=p?p.id:('n:'+nm); var r=m[k]||(m[k]={key:k, name:p?p.name:nm, teamId:p?p.team:null, flag:'', teamName:'', goals:0,assists:0,og:0,yellow:0,red:0,apps:0}); r[field]++; if(!r.flag&&evTeam){r.flag=evTeam.flag;r.teamName=evTeam.name;} }
    (s.keyEvents||[]).forEach(ev=>{
      var ty=((ev.type||{}).type||'').toLowerCase(), txt=(ev.shortText||ev.text||'');
      var parts=(ev.participants||ev.athletesInvolved||[]).map(a=>(a.athlete||{}).displayName).filter(Boolean);
      var evT=ev.team?espnTeam(ev.team.displayName):null;
      if(/own.?goal/.test(ty)||/own goal/i.test(txt)){ if(parts[0])mbump(parts[0],'og',evT); }
      else if((/goal/.test(ty)||/penalty.*scored/.test(ty))&&!/missed|saved|disallow/.test(ty+txt.toLowerCase())){ if(parts[0])mbump(parts[0],'goals',evT); if(parts[1])mbump(parts[1],'assists',evT); }
      else if(/yellow.?card/.test(ty)){ if(parts[0])mbump(parts[0],'yellow',evT); }
      else if(/red.?card/.test(ty)){ if(parts[0])mbump(parts[0],'red',evT); }
    });
    var appeared=new Set();
    (s.rosters||[]).forEach(rs=>{ (rs.roster||[]).forEach(pl=>{ if(pl.starter && pl.athlete && pl.athlete.displayName) appeared.add(pl.athlete.displayName); }); });
    (s.keyEvents||[]).forEach(ev=>{ if(/substitution/i.test((ev.type||{}).type||'')){ var inA=((ev.participants||[])[0]||{}).athlete; if(inA&&inA.displayName) appeared.add(inA.displayName); } });
    appeared.forEach(nm=>mbump(nm,'apps'));
    var mout=Object.values(m).map(s=>{ var t=s.teamId&&teamsByName[s.teamId]; return {key:s.key, name:s.name, team:(t?t.name:s.teamName)||'', flag:(t?t.flag:s.flag)||'', pid:s.teamId?s.key:null, goals:s.goals, assists:s.assists, og:s.og, yellow:s.yellow, red:s.red, apps:s.apps}; });
    await rpc('set_match_stats', { mid: eidToMatch[eid], d: { players: mout } });  // 경기별 행(DB) — 클라이언트도 라이브 중 같은 행 갱신
    if((s.rosters||[]).some(rs=>(rs.roster||[]).some(p=>p.starter))){ await rpc('set_match_lineup', { mid: eidToMatch[eid], d: { rosters: s.rosters, keyEvents: s.keyEvents, header: s.header, headToHeadGames: s.headToHeadGames } }); }  // 확정 라인업+상대전적 DB 저장
    mout.forEach(p=>{ var r=rec(p.key,p.name); ['goals','assists','og','yellow','red','apps'].forEach(f=>r[f]+=p[f]); if(!r.flag){r.flag=p.flag;r.teamName=p.team;} });  // 누적
    await sleep(110);
  }
  const out=Object.values(stats).map(s=>({ name:s.name, team:s.teamName||'', flag:s.flag||'', pid:(s.key&&s.key.indexOf('n:')!==0)?s.key:null, goals:s.goals, assists:s.assists, og:s.og, yellow:s.yellow, red:s.red, apps:s.apps }));
  fs.writeFileSync('stats.json', JSON.stringify({players:out}));  // 폴백용(커밋 안 함)
  console.log('경기:',eids.length,'| 기록선수:',out.length,'| 경기별 행 적재 완료');
})();
