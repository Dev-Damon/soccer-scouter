// 치지직 풀하이라이트 자동수집 — 종료경기 중 MATCH_HIGHLIGHTS에 없는 경기를 찾아 app.js 갱신.
// 소스: JTBC·JTBCSPORTS·KBS 3채널(JTBC 우선, KBS 폴백). 제목에 두 팀명+"하이라이트", "N분"클립 제외, 길이 300~1200초(풀하이라이트).
// 컷오프: 경기 종료 후 CUTOFF_H 시간까지만 검색(안 올라오는 경기 무한검색 방지). 업로드 지연은 highlight_delays.log에 측정 기록.
// 단독 실행 가능(node scripts/fetch_highlights.js [--dry]); update_live.js가 매 갱신 때 호출.
const https = require('https'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

// 치지직 월드컵 하이라이트 채널 — JTBC 우선(pri 0), KBS 폴백(pri 1). 풀하이라이트(300~1200초) 선호.
const CHANNELS = [
  { id: '8ecd602c251f30fd7f09463e9f55609f', src: 'JTBC', pri: 0 },        // 북중미 월드컵 JTBC
  { id: '1656686e9f50aa321a83482046318bac', src: 'JTBCSPORTS', pri: 0 },  // 북중미 월드컵 JTBCSPORTS
  { id: '9f5a638cb687474249ada6d21a286153', src: 'KBS', pri: 1 },         // 북중미 월드컵 KBS1
];
const CUTOFF_H = 8;  // 경기 종료 후 N시간까지만 검색(영영 안 올라오는 경기 무한검색 방지)
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app.js');
const DELAY_LOG = path.join(ROOT, 'scripts', 'highlight_delays.log');  // 업로드 지연 측정 로그
const DRY = process.argv.includes('--dry');

function getJson(u) {
  return new Promise(r => {
    https.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { r(JSON.parse(d)); } catch (e) { r(null); } });
    }).on('error', () => r(null));
  });
}

// 팀명 별칭 — 치지직 제목 표기가 data.js와 다를 수 있는 팀만 보강.
const ALIAS = {
  'south-korea': ['대한민국', '한국'],
  'turkey': ['튀르키예', '터키'],
  'south-africa': ['남아프리카공화국', '남아공'],
  'bosnia-and-herzegovina': ['보스니아 헤르체고비나', '보스니아'],
  'dr-congo': ['콩고민주공화국', '콩고'],
  'saudi-arabia': ['사우디아라비아', '사우디'],
  'united-states': ['미국'],
  'cape-verde': ['카보베르데', '카부베르데'],
};

function loadData() {
  global.window = {};
  require(path.join(ROOT, 'data.js'));
  return global.window.DATA;
}

function kickoff(fx) {
  const dt = (fx.kstDate || fx.date), tm = (fx.kstTime || fx.time || '00:00');
  const t = Date.parse(dt + 'T' + tm + ':00+09:00');
  return isNaN(t) ? 0 : t;
}

// app.js의 MATCH_HIGHLIGHTS 블록(마커 사이) 파싱 → { "match-1": "url", ... }
function parseExisting(src) {
  const m = src.match(/\/\* HL-AUTO-START \*\/([\s\S]*?)\/\* HL-AUTO-END \*\//);
  const map = {};
  if (!m) return { map, hasMarkers: false };
  const re = /"(match-\d+)"\s*:\s*"([^"]+)"/g; let x;
  while ((x = re.exec(m[1]))) map[x[1]] = x[2];
  return { map, hasMarkers: true };
}

function buildBlock(map, fixById) {
  const ids = Object.keys(map).sort((a, b) => (+a.split('-')[1]) - (+b.split('-')[1]));
  const lines = ids.map((id, i) => {
    const fx = fixById[id], label = fx ? (fx.homeName + '-' + fx.awayName) : '';
    const comma = i < ids.length - 1 ? ',' : '';
    return '    "' + id + '": "' + map[id] + '"' + comma + (label ? ' // ' + label : '');
  });
  return '\n' + lines.join('\n') + '\n    ';
}

(async () => {
  const D = loadData();
  const fixById = {}; D.fixtures.forEach(f => fixById[f.id] = f);
  const teamsById = {}; D.teams.forEach(t => teamsById[t.id] = t);
  const names = id => [teamsById[id] && teamsById[id].name].concat(ALIAS[id] || []).filter(Boolean);

  // 녹아웃(32강~)은 정적 data.js에서 homeId=null → ESPN 실제 팀쌍을 킥오프 시각(±2h)으로 매칭해 해소(라이브/JTBC 감지와 동일 패턴). 없으면 32강 하이라이트가 영영 안 잡힘.
  const T_ALIAS_ESPN = { czechia: 'czech-republic', korearepublic: 'south-korea', usa: 'united-states', turkiye: 'turkey', caboverde: 'cape-verde', cotedivoire: 'ivory-coast', congodr: 'dr-congo', bosniaherzegovina: 'bosnia-and-herzegovina' };
  const normN = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ð/g, 'd').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ß/g, 'ss').replace(/þ/g, 'th').replace(/[^a-z ]/g, '').trim();
  const espnTeamId = nm => { const s = normN(nm).replace(/ /g, ''); let slug = normN(nm).replace(/ /g, '-'); slug = T_ALIAS_ESPN[s] || slug; return teamsById[slug] ? slug : null; };
  try {
    const _now = Date.now(), espnDates = [];
    for (let i = 0; i < 4; i++) { const dt = new Date(_now - i * 86400000); espnDates.push('' + dt.getUTCFullYear() + String(dt.getUTCMonth() + 1).padStart(2, '0') + String(dt.getUTCDate()).padStart(2, '0')); }  // 오늘~3일전(녹아웃 백필 포함)
    for (const dt of espnDates) {
      const j = await getJson('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=' + dt);
      (j && j.events || []).forEach(e => {
        const c = (e.competitions || [])[0]; if (!c) return; const stt = ((e.status || {}).type || {}).state; if (stt !== 'in' && stt !== 'post') return;
        const comp = c.competitors || [], H = comp.find(x => x.homeAway === 'home'), A = comp.find(x => x.homeAway === 'away'); if (!H || !A) return;
        const hid = espnTeamId(H.team && H.team.displayName), aid = espnTeamId(A.team && A.team.displayName); if (!hid || !aid) return;
        const ed = Date.parse(e.date); let best = null, bestD = Infinity;
        D.fixtures.forEach(f => { if (f.group || (f.homeId && f.awayId)) return; const ko = kickoff(f); if (!ko) return; const d = Math.abs(ko - ed); if (d < bestD) { bestD = d; best = f; } });
        if (best && bestD < 2 * 3600000) { best.homeId = hid; best.awayId = aid; best.homeName = (teamsById[hid] || {}).name || best.homeName; best.awayName = (teamsById[aid] || {}).name || best.awayName; }
      });
    }
  } catch (e) { console.log('[highlights] 녹아웃 ESPN 해소 실패(조별은 정상):', e.message); }

  let src = fs.readFileSync(APP, 'utf8');
  const { map: existing, hasMarkers } = parseExisting(src);
  if (!hasMarkers) { console.log('[highlights] HL-AUTO 마커 없음 — app.js에 마커 추가 필요. 중단.'); process.exit(0); }

  // 종료경기 중 링크 없는 경기. update_live가 ESPN 'post'로 잡은 경기ID를 인자로 넘김(시간 하드코딩 X).
  const argIds = process.argv.slice(2).filter(a => /^match-/.test(a));
  let pending;
  if (argIds.length) {
    pending = argIds.map(id => fixById[id]).filter(fx => fx && fx.homeId && fx.awayId && !existing[fx.id]);  // ESPN 종료경기만
  } else {
    const now = Date.now();  // 단독/크론 폴백: 종료 후 CUTOFF_H 이내 경기만(무한검색 방지)
    pending = D.fixtures.filter(fx => { const ko = kickoff(fx); if (!ko || !fx.homeId || !fx.awayId || existing[fx.id]) return false; const end = ko + 115 * 60000; return now > end && now < end + CUTOFF_H * 3600000; });
  }
  if (!pending.length) { if (DRY) console.log('[highlights] 대기 경기 없음'); process.exit(0); }

  // 채널 영상목록(JTBC·JTBCSPORTS·KBS) — 각 영상에 출처/우선순위 태그
  let vids = [];
  for (const ch of CHANNELS) {
    for (let p = 0; p < 4; p++) {
      const r = await getJson('https://api.chzzk.naver.com/service/v1/channels/' + ch.id + '/videos?sortType=LATEST&pagingType=PAGE&page=' + p + '&size=50');
      const data = r && r.content && r.content.data; if (!data || !data.length) break;
      data.forEach(v => { v._src = ch.src; v._pri = ch.pri; }); vids = vids.concat(data);
      if (data.length < 50) break;
    }
  }
  if (!vids.length) { console.log('[highlights] 채널 영상 조회 실패'); process.exit(0); }

  const nosp = s => (s || '').replace(/\s+/g, '');  // 공백 무시(예: "남아프리카 공화국"="남아프리카공화국")
  const found = {};
  for (const fx of pending) {
    const hN = names(fx.homeId).map(nosp), aN = names(fx.awayId).map(nosp);
    const cands = vids.filter(v => {
      const traw = v.videoTitle || '', t = nosp(traw);
      if (!/하이라이트/.test(traw)) return false;
      if (/\d+\s*분\s*하이라이트/.test(traw)) return false;          // "2분/3분 하이라이트" 제외
      if (!(v.duration >= 300 && v.duration <= 1200)) return false; // 풀경기·짧은클립 제외
      return hN.some(n => t.includes(n)) && aN.some(n => t.includes(n));
    });
    if (!cands.length) continue;
    cands.sort((a, b) => a._pri - b._pri || b.duration - a.duration);  // JTBC 우선 → 긴 영상 우선
    const hit = cands[0];
    found[fx.id] = { url: 'https://chzzk.naver.com/video/' + hit.videoNo, title: hit.videoTitle, dur: hit.duration, src: hit._src, delayMin: Math.round((Date.now() - (kickoff(fx) + 115 * 60000)) / 60000) };
  }

  const newIds = Object.keys(found);
  if (!newIds.length) { if (DRY) console.log('[highlights] 매칭 없음 (대기 ' + pending.length + '경기)'); process.exit(0); }

  newIds.forEach(id => {
    console.log('[highlights] +', id, '[' + found[id].src + ']', found[id].title, '(' + found[id].dur + 's, 종료후 ' + found[id].delayMin + '분)', found[id].url);
    if (!DRY) try { fs.appendFileSync(DELAY_LOG, [new Date().toISOString(), id, found[id].src, found[id].delayMin + 'min', found[id].title].join('\t') + '\n'); } catch (e) {}  // 업로드 지연 측정
  });
  if (DRY) process.exit(0);

  // app.js 블록 갱신
  const merged = Object.assign({}, existing);
  newIds.forEach(id => merged[id] = found[id].url);
  const block = buildBlock(merged, fixById);
  src = src.replace(/(\/\* HL-AUTO-START \*\/)[\s\S]*?(\/\* HL-AUTO-END \*\/)/, '$1' + block.replace(/\$/g, '$$$$') + '$2');
  fs.readFileSync(APP); // touch guard
  fs.writeFileSync(APP, src);

  // highlights.json 동시 출력 — 토스 미니앱(app.js 번들 스냅샷)도 런타임 fetch로 최신 하이라이트 수신
  try { fs.writeFileSync(path.join(ROOT, 'highlights.json'), JSON.stringify(merged) + '\n'); console.log('[highlights] highlights.json 갱신:', Object.keys(merged).length); } catch (e) {}

  // 문법 검증
  try { execFileSync(process.execPath, ['--check', APP], { stdio: 'ignore' }); }
  catch (e) { console.log('[highlights] 문법오류 — 롤백'); execFileSync('git', ['checkout', '--', 'app.js'], { cwd: ROOT, stdio: 'ignore' }); process.exit(1); }

  // 캐시버전(?v) 갱신 — 안 올리면 재방문자가 캐시된 옛 app.js를 써서 하이라이트가 안 보임(늦게 붙는 원인)
  try {
    const IDX = path.join(ROOT, 'index.html');
    let idx = fs.readFileSync(IDX, 'utf8');
    idx = idx.replace(/app\.js\?v=[^"]*/, 'app.js?v=h' + Date.now());
    fs.writeFileSync(IDX, idx);
  } catch (e) { console.log('[highlights] 캐시버전 갱신 실패:', e.message); }

  // 커밋·배포 (다른 작업 미스테이지 변경에도 안전하도록 autostash 리베이스)
  try {
    execFileSync('git', ['add', 'app.js', 'index.html', 'highlights.json', 'scripts/highlight_delays.log'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', '하이라이트 자동수집: ' + newIds.join(',')], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['-c', 'rebase.autoStash=true', 'pull', '--rebase', 'origin', 'main'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['push', 'origin', 'main'], { cwd: ROOT, stdio: 'ignore' });
    console.log('[highlights] 배포 완료:', newIds.join(','));
  } catch (e) { console.log('[highlights] 배포 실패:', e.message); }
})();
