// 데이터 자동 갱신 스크립트 (GitHub Actions에서 실행 — 일반 Node 환경)
// 하는 일:
//  1) data.js 로드
//  2) 종료된 경기(score 있음)로 조 순위(standings) 재계산  ← 토큰 0, 순수 계산
//  3) meta.lastUpdated 갱신
//  4) data.js 다시 기록
// TODO(연결 시): 경기 결과/스코어 수집(무료 결과 소스 fetch), 토너먼트 대진 진출 반영,
//                선수 부상/컨디션·뉴스(ANTHROPIC_API_KEY로 Claude 호출). 아래 표시 지점 참고.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data.js");

function loadData() {
  const src = readFileSync(DATA_PATH, "utf8");
  const start = src.indexOf("{", src.indexOf("window.DATA"));
  const end = src.lastIndexOf("}");
  const obj = JSON.parse(src.slice(start, end + 1));
  const header = src.slice(0, src.indexOf("window.DATA"));
  return { obj, header };
}
function saveData(obj, header) {
  writeFileSync(DATA_PATH, header + "window.DATA = " + JSON.stringify(obj, null, 2) + ";\n");
}

// ── 2) 결과 → 조 순위 재계산 ───────────────────────────────────────────────
function recomputeStandings(D) {
  const teamName = {};
  (D.teams || []).forEach((t) => { teamName[t.id] = t.name; });
  const groups = D.groups || [];
  const standings = {};

  groups.forEach((g) => {
    const rows = {};
    (g.teamIds || []).forEach((id) => {
      rows[id] = { teamId: id, name: teamName[id] || id, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 };
    });
    (D.fixtures || []).forEach((fx) => {
      if (fx.group !== g.group) return;
      if (fx.status !== "종료" || !fx.score) return;
      const h = rows[fx.homeId], a = rows[fx.awayId];
      if (!h || !a) return;
      const hs = Number(fx.score.home), as = Number(fx.score.away);
      if (Number.isNaN(hs) || Number.isNaN(as)) return;
      h.P++; a.P++; h.GF += hs; h.GA += as; a.GF += as; a.GA += hs;
      if (hs > as) { h.W++; a.L++; h.Pts += 3; }
      else if (hs < as) { a.W++; h.L++; a.Pts += 3; }
      else { h.D++; a.D++; h.Pts += 1; a.Pts += 1; }
    });
    const arr = Object.values(rows).map((r) => ({ ...r, GD: r.GF - r.GA }));
    arr.sort((x, y) => y.Pts - x.Pts || y.GD - x.GD || y.GF - x.GF || x.name.localeCompare(y.name));
    standings[g.group] = arr;
  });
  D.standings = standings;
}

// ── (TODO) 결과/뉴스 수집 자리 ─────────────────────────────────────────────
async function fetchResults(_D) {
  // TODO: 무료 결과 소스에서 그날 종료 경기 스코어를 받아 fixtures[].status/score/scorers 채우기.
  // 채우기만 하면 recomputeStandings가 순위·대진을 자동 반영.
}
async function fetchNewsAndInjuries(_D) {
  // TODO: process.env.ANTHROPIC_API_KEY 있으면 Claude로 본선 팀 핵심선수 부상/뉴스 요약 →
  //       teams[].news[] / players[].availability 갱신. (요약+출처만, 저빈도)
}

async function main() {
  const { obj: D, header } = loadData();
  await fetchResults(D);          // 현재는 no-op (소스 연결 시 동작)
  await fetchNewsAndInjuries(D);  // 현재는 no-op (API 키 연결 시 동작)
  recomputeStandings(D);          // 지금도 동작: score 있는 경기로 순위 계산
  D.meta = D.meta || {};
  D.meta.lastUpdated = new Date().toISOString();
  saveData(D, header);
  const done = (D.fixtures || []).filter((f) => f.status === "종료" && f.score).length;
  console.log(`갱신 완료. 종료 경기 ${done}건 반영, 조 순위 ${Object.keys(D.standings || {}).length}개조 계산.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
