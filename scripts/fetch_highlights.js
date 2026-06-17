// 치지직 JTBC 풀하이라이트 자동수집 — 종료경기 중 MATCH_HIGHLIGHTS에 없는 경기를 채널에서 찾아 app.js 갱신.
// 소스: 치지직 "북중미 월드컵 JTBC" 단일 채널. 제목 "{홈} vs {원정} 하이라이트(JTBC)" / 길이 ~10~12분.
// 필터: 제목에 두 팀명 + "하이라이트" + "(JTBC)" 포함, "N분" 클립 제외, 길이 300~1200초. → KBS·2분짜리·풀경기 자동 배제.
// 단독 실행도 가능(node scripts/fetch_highlights.js [--dry]); update_live.js가 매 갱신 때 호출.
const https = require('https'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const CHANNEL_ID = '8ecd602c251f30fd7f09463e9f55609f';  // 치지직 "북중미 월드컵 JTBC"
const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'app.js');
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

  let src = fs.readFileSync(APP, 'utf8');
  const { map: existing, hasMarkers } = parseExisting(src);
  if (!hasMarkers) { console.log('[highlights] HL-AUTO 마커 없음 — app.js에 마커 추가 필요. 중단.'); process.exit(0); }

  // 종료(킥오프+150분 경과)됐는데 링크 없는 경기
  const now = Date.now();
  const pending = D.fixtures.filter(fx => {
    const ko = kickoff(fx); if (!ko) return false;
    return now > ko + 150 * 60000 && fx.homeId && fx.awayId && !existing[fx.id];
  });
  if (!pending.length) { if (DRY) console.log('[highlights] 대기 경기 없음'); process.exit(0); }

  // 채널 영상목록(최근 ~6페이지=300여개)
  let vids = [];
  for (let p = 0; p < 6; p++) {
    const r = await getJson('https://api.chzzk.naver.com/service/v1/channels/' + CHANNEL_ID + '/videos?sortType=LATEST&pagingType=PAGE&page=' + p + '&size=50');
    const data = r && r.content && r.content.data; if (!data || !data.length) break;
    vids = vids.concat(data);
    if (data.length < 50) break;
  }
  if (!vids.length) { console.log('[highlights] 채널 영상 조회 실패'); process.exit(0); }

  const found = {};
  for (const fx of pending) {
    const hN = names(fx.homeId), aN = names(fx.awayId);
    const hit = vids.find(v => {
      const t = v.videoTitle || '';
      if (!/하이라이트/.test(t) || !/\(JTBC\)/i.test(t)) return false;
      if (/\d+\s*분\s*하이라이트/.test(t)) return false;            // "2분 하이라이트" 등 제외
      if (!(v.duration >= 300 && v.duration <= 1200)) return false; // 풀경기(수천초)·짧은클립 제외
      return hN.some(n => t.includes(n)) && aN.some(n => t.includes(n));
    });
    if (hit) found[fx.id] = { url: 'https://chzzk.naver.com/video/' + hit.videoNo, title: hit.videoTitle, dur: hit.duration };
  }

  const newIds = Object.keys(found);
  if (!newIds.length) { if (DRY) console.log('[highlights] 매칭 없음 (대기 ' + pending.length + '경기)'); process.exit(0); }

  newIds.forEach(id => console.log('[highlights] +', id, found[id].title, '(' + found[id].dur + 's)', found[id].url));
  if (DRY) process.exit(0);

  // app.js 블록 갱신
  const merged = Object.assign({}, existing);
  newIds.forEach(id => merged[id] = found[id].url);
  const block = buildBlock(merged, fixById);
  src = src.replace(/(\/\* HL-AUTO-START \*\/)[\s\S]*?(\/\* HL-AUTO-END \*\/)/, '$1' + block.replace(/\$/g, '$$$$') + '$2');
  fs.readFileSync(APP); // touch guard
  fs.writeFileSync(APP, src);

  // 문법 검증
  try { execFileSync(process.execPath, ['--check', APP], { stdio: 'ignore' }); }
  catch (e) { console.log('[highlights] 문법오류 — 롤백'); execFileSync('git', ['checkout', '--', 'app.js'], { cwd: ROOT, stdio: 'ignore' }); process.exit(1); }

  // 커밋·배포 (다른 작업 미스테이지 변경에도 안전하도록 autostash 리베이스)
  try {
    execFileSync('git', ['add', 'app.js'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', '하이라이트 자동수집: ' + newIds.join(',')], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['-c', 'rebase.autoStash=true', 'pull', '--rebase', 'origin', 'main'], { cwd: ROOT, stdio: 'ignore' });
    execFileSync('git', ['push', 'origin', 'main'], { cwd: ROOT, stdio: 'ignore' });
    console.log('[highlights] 배포 완료:', newIds.join(','));
  } catch (e) { console.log('[highlights] 배포 실패:', e.message); }
})();
