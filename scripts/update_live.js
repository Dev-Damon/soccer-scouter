// 라이브 상태 공유캐시 갱신 — launchd가 1분마다 실행. 보는 사람 0명이어도 live_state를 항상 최신으로 유지.
// (브라우저 클라이언트도 20초마다 갱신하지만, 시청자 없을 때 대비한 서버측 백업)
const https = require('https'), path = require('path');
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoemNoZ3Zua3dkcm94ZnJnanZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjM1NDcsImV4cCI6MjA5NjU5OTU0N30.eRMPkzUO1aOd3s1R4-JnQQ912BhplhcO6qNut4Ro4Kg';  // 레거시 anon JWT(RLS 보호·공개안전) — 직접 REST는 이 키 필요
function get(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))}).on('error',()=>r(''))})}
function rpc(name,body){return new Promise(r=>{var data=JSON.stringify(body);var req=https.request({hostname:'jhzchgvnkwdroxfrgjvm.supabase.co',path:'/rest/v1/rpc/'+name,method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))});req.on('error',()=>r('ERR'));req.write(data);req.end();})}
global.window={}; require(path.join(__dirname,'..','data.js')); const D=global.window.DATA;
const teamsById={}; D.teams.forEach(t=>teamsById[t.id]=t);
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z ]/g,'').trim();}
const T_ALIAS={czechia:'czech-republic',korearepublic:'south-korea',usa:'united-states',turkiye:'turkey',caboverde:'cape-verde',cotedivoire:'ivory-coast',congodr:'dr-congo',bosniaherzegovina:'bosnia-and-herzegovina'};
function espnTeam(nm){var s=norm(nm).replace(/ /g,'');var slug=norm(nm).replace(/ /g,'-');slug=T_ALIAS[s]||slug;return teamsById[slug]||null;}
const fixByPair={}; D.fixtures.forEach(f=>{if(f.homeId&&f.awayId)fixByPair[[f.homeId,f.awayId].sort().join('|')]=f.id;});
function parseGoals(c){var o=[];(c.details||[]).forEach(d=>{var t=(d.type&&d.type.text)||'';if(/disallow/i.test(t))return;var og=d.ownGoal===true||/own.?goal/i.test(t);var g=d.scoringPlay===true||/goal/i.test(t);if(!g)return;o.push({who:((d.athletesInvolved||[])[0]||{}).displayName||'',clk:(d.clock||{}).displayValue||'',og:og});});return o;}
const SCORE='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
(async()=>{
  var raw; try{ raw=await get(SCORE); var d=JSON.parse(raw); }catch(e){ console.log(new Date().toISOString(),'ESPN fetch 실패, skip'); return; }
  var live={};
  (d.events||[]).forEach(e=>{
    var c=(e.competitions||[])[0]; if(!c)return; if(((e.status||{}).type||{}).state!=='in')return;
    var comp=c.competitors||[]; var H=comp.find(x=>x.homeAway==='home'),A=comp.find(x=>x.homeAway==='away'); if(!H||!A)return;
    var hT=espnTeam((H.team||{}).displayName),aT=espnTeam((A.team||{}).displayName); if(!hT||!aT)return;
    var fid=fixByPair[[hT.id,aT.id].sort().join('|')]; if(!fid)return; var fx=D.fixtures.find(f=>f.id===fid);
    live[fid]={state:'in',hs:fx.homeId===hT.id?+H.score:+A.score,as:fx.homeId===hT.id?+A.score:+H.score,clock:(e.status||{}).displayClock||'',events:parseGoals(c)};
  });
  var res=await rpc('set_live_state',{d:{t:Date.now(),live:live}});
  console.log(new Date().toISOString(),'live_state 갱신:',Object.keys(live).length,'경기',res&&res!=='null'&&res!==''?('| '+res.slice(0,80)):'OK');
})();
