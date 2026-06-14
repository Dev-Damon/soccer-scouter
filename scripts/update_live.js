// 라이브 + 종료경기 DB 갱신 — launchd가 1분마다 실행.
// ① 진행중(in): live_state 공유캐시 갱신(시청자 0명이어도 신규 사용자에게 즉시) ② 종료(post): 결과(스코어+득점자) match_results + 라인업 lineup:<id> 영구저장
// (브라우저 클라가 보는 동안도 갱신하지만, 시청자 없을 때 종료된 경기가 DB에 안 들어가던 문제 해결)
const https = require('https'), path = require('path');
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoemNoZ3Zua3dkcm94ZnJnanZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMjM1NDcsImV4cCI6MjA5NjU5OTU0N30.eRMPkzUO1aOd3s1R4-JnQQ912BhplhcO6qNut4Ro4Kg';  // 레거시 anon JWT(RLS 보호·공개안전) — 직접 REST 필요
function get(u){return new Promise(r=>{https.get(u,{headers:{'User-Agent':'Mozilla/5.0'}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))}).on('error',()=>r(''))})}
function rpc(name,body){return new Promise(r=>{var data=JSON.stringify(body);var req=https.request({hostname:'jhzchgvnkwdroxfrgjvm.supabase.co',path:'/rest/v1/rpc/'+name,method:'POST',headers:{apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json','Content-Length':Buffer.byteLength(data)}},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>r(d))});req.on('error',()=>r('ERR'));req.write(data);req.end();})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
global.window={}; require(path.join(__dirname,'..','data.js')); const D=global.window.DATA;
const teamsById={}; D.teams.forEach(t=>teamsById[t.id]=t);
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ı/g,'i').replace(/ø/g,'o').replace(/ł/g,'l').replace(/đ/g,'d').replace(/ð/g,'d').replace(/æ/g,'ae').replace(/œ/g,'oe').replace(/ß/g,'ss').replace(/þ/g,'th').replace(/[^a-z ]/g,'').trim();}
const T_ALIAS={czechia:'czech-republic',korearepublic:'south-korea',usa:'united-states',turkiye:'turkey',caboverde:'cape-verde',cotedivoire:'ivory-coast',congodr:'dr-congo',bosniaherzegovina:'bosnia-and-herzegovina'};
function espnTeam(nm){var s=norm(nm).replace(/ /g,'');var slug=norm(nm).replace(/ /g,'-');slug=T_ALIAS[s]||slug;return teamsById[slug]||null;}
const fixByPair={}; D.fixtures.forEach(f=>{if(f.homeId&&f.awayId)fixByPair[[f.homeId,f.awayId].sort().join('|')]=f.id;});
function parseGoals(c){var o=[];(c.details||[]).forEach(d=>{var t=(d.type&&d.type.text)||'';if(/disallow/i.test(t))return;var og=d.ownGoal===true||/own.?goal/i.test(t);var g=d.scoringPlay===true||/goal/i.test(t);if(!g)return;o.push({who:((d.athletesInvolved||[])[0]||{}).displayName||'',clk:(d.clock||{}).displayValue||'',og:og});});return o;}
const SCORE='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=';
const SUM='https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=';
(async()=>{
  // 오늘+어제(UTC) 스캔 (KST 경계 자정 넘는 경기 포함)
  var now=new Date(), dates=[];
  for(var i=0;i<2;i++){var dt=new Date(now.getTime()-i*86400000);dates.push(dt.toISOString().slice(0,10).replace(/-/g,''));}
  var live={}, posts={};  // posts: fid -> {eid,hs,as,ev}
  for(const dt of dates){
    var raw=await get(SCORE+dt), d; try{d=JSON.parse(raw)}catch(e){continue}
    (d.events||[]).forEach(e=>{
      var c=(e.competitions||[])[0]; if(!c)return; var ty=((e.status||{}).type||{}); var st=ty.state; if(st!=='in'&&st!=='post')return;
      var ht=(ty.name==='STATUS_HALFTIME'||ty.detail==='HT'||ty.description==='Halftime');  // 하프타임
      var comp=c.competitors||[]; var H=comp.find(x=>x.homeAway==='home'),A=comp.find(x=>x.homeAway==='away'); if(!H||!A)return;
      var hT=espnTeam((H.team||{}).displayName),aT=espnTeam((A.team||{}).displayName); if(!hT||!aT)return;
      var fid=fixByPair[[hT.id,aT.id].sort().join('|')]; if(!fid)return; var fx=D.fixtures.find(f=>f.id===fid);
      var hs=fx.homeId===hT.id?+H.score:+A.score, as=fx.homeId===hT.id?+A.score:+H.score, ev=parseGoals(c);
      if(st==='in') live[fid]={state:'in',hs:hs,as:as,clock:ht?'전반 종료':((e.status||{}).displayClock||''),events:ev};
      else posts[fid]={eid:e.id,hs:hs,as:as,ev:ev};
    });
    await sleep(80);
  }
  await rpc('set_live_state',{d:{t:Date.now(),live:live}});  // ① 라이브 공유캐시
  var nr=0;
  for(const fid of Object.keys(posts)){  // ② 종료경기 결과+라인업 영구저장
    var p=posts[fid];
    await rpc('set_match_result',{mid:fid,h:p.hs,a:p.as,ev:p.ev});
    try{ var s=JSON.parse(await get(SUM+p.eid));
      if((s.rosters||[]).some(rs=>(rs.roster||[]).some(x=>x.starter))) await rpc('set_match_lineup',{mid:fid,d:{rosters:s.rosters,keyEvents:s.keyEvents,header:s.header,headToHeadGames:s.headToHeadGames,boxscore:s.boxscore}});
    }catch(e){}
    nr++; await sleep(100);
  }
  console.log(new Date().toISOString(),'live:',Object.keys(live).length,'/ 종료저장:',nr,'경기');

  // ③ 종료경기 OG 카드 자동 재생성+배포 — 결과가 새/변경된 경기만(경기별 ?v 증가로 카톡 캐시 무효화)
  try{
    const fs=require('fs'), {execFileSync}=require('child_process');
    const ROOT=path.join(__dirname,'..'), verF=path.join(ROOT,'ogm','og_ver.json');
    let ver={}; try{ver=JSON.parse(fs.readFileSync(verF,'utf8'))}catch(e){}
    const changed=[];
    for(const fid of Object.keys(posts)){
      const p=posts[fid], sig=p.hs+'-'+p.as+'-'+(p.ev||[]).length;
      const cur=ver[fid]||{sig:'',v:3};
      if(cur.sig!==sig){ ver[fid]={sig:sig, v:(cur.v||3)+1}; changed.push(fid); }
    }
    if(changed.length){
      fs.writeFileSync(verF,JSON.stringify(ver,null,1));
      for(const fid of changed) execFileSync('node',[path.join(__dirname,'gen_og_render.js'),fid],{cwd:ROOT,timeout:90000,stdio:'ignore'});
      execFileSync('node',[path.join(__dirname,'gen_match_pages.js')],{cwd:ROOT,timeout:60000,stdio:'ignore'});  // ?v 갱신 반영
      execFileSync('git',['add','ogm','m','sitemap.xml'],{cwd:ROOT,stdio:'ignore'});
      execFileSync('git',['commit','-m','OG 자동재생성(종료경기 결과반영): '+changed.join(',')],{cwd:ROOT,stdio:'ignore'});
      execFileSync('git',['pull','--rebase','origin','main'],{cwd:ROOT,stdio:'ignore'});
      execFileSync('git',['push','origin','main'],{cwd:ROOT,stdio:'ignore'});
      console.log('OG 자동배포:',changed.join(','));
    }
  }catch(e){ console.log('OG 자동배포 실패(라이브갱신은 정상):',e.message); }
})();
