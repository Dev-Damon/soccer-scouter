// 크론 게이트 — 라이브 또는 최근 종료(킥오프 6h 내) 경기가 있으면 exit 0(작업 필요), 없으면 exit 1(스킵).
// 끝난 경기 데이터는 불변이므로, 경기 없는 시간엔 집계/정산/정적갱신을 통째로 스킵해 ESPN·DB 호출을 0으로.
const SB = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=";
const ds = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");
const now = Date.now();
let active = false;
for (const dd of [ds(now), ds(now - 86400000)]) {  // 오늘+어제(UTC 경계 경기 포함)
  try {
    const j = await (await fetch(SB + dd)).json();
    for (const e of (j.events || [])) {
      const st = ((e.competitions || [])[0] || {}).status;
      const state = st && st.type && st.type.state;
      if (state === "in") { active = true; break; }  // 진행 중
      if (state === "post" && e.date) {               // 최근 종료(킥오프 6h 내 = 막 끝난 경기 최종본 1회 캡처용)
        const since = now - Date.parse(e.date);
        if (since >= 0 && since < 6 * 3600 * 1000) { active = true; break; }
      }
    }
  } catch (e) { /* 조회 실패 시 보수적으로 다음 날짜 시도 */ }
  if (active) break;
}
console.log(active ? "active — 작업 진행" : "no live/recent match — 스킵");
process.exit(active ? 0 : 1);
