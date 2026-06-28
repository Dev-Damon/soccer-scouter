// 종료경기 boxscore(점유율·슈팅·패스 등) + 라인업을 ESPN에서 백필 → 정적 lu/match-N.json 생성.
// 배경: DB lineup 레코드 60/72경기에 boxscore가 없어 경기 통계가 안 나옴. ESPN summary는 옛 경기도 boxscore 보관 → 백필 가능.
// 결과 lu/ 파일을 앱이 정적(getLineup static-first)으로 로드 → 통계 복구 + Supabase egress 절감.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
global.window = {};
await import(`file://${join(ROOT, "data.js")}`);
const D = global.window.DATA;
const teamsById = {}; D.teams.forEach((t) => (teamsById[t.id] = t));

const ESPN_ALIAS = { "czechia": "czech-republic", "turkiye": "turkey", "cabo-verde": "cape-verde", "cote-divoire": "ivory-coast", "cotedivoire": "ivory-coast", "usa": "united-states", "korea-republic": "south-korea", "congo-dr": "dr-congo", "bosnia-herzegovina": "bosnia-and-herzegovina" };
const espnSlug = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['.]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function espnTeamId(name) { let s = espnSlug(name); s = ESPN_ALIAS[s] || s; return teamsById[s] ? s : null; }

const SB = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=";
const SUM = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event=";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sbCache = {};
async function scoreboard(dd) { if (sbCache[dd]) return sbCache[dd]; const j = await (await fetch(SB + dd)).json().catch(() => ({})); sbCache[dd] = j; return j; }
function ds(t) { return new Date(t).toISOString().slice(0, 10).replace(/-/g, ""); }

async function resolveEid(fx) {
  const base = Date.parse((fx.date || fx.kstDate) + "T12:00:00Z");
  const key = [fx.homeId, fx.awayId].sort().join("|");
  for (const dd of [ds(base), ds(base - 86400000), ds(base + 86400000)]) {
    const j = await scoreboard(dd);
    for (const e of (j.events || [])) {
      const c = (e.competitions || [])[0]; if (!c) continue;
      const ids = (c.competitors || []).map((t) => espnTeamId(t.team && t.team.displayName)).filter(Boolean).sort().join("|");
      if (ids === key) return e.id;
    }
  }
  return null;
}

mkdirSync(join(ROOT, "lu"), { recursive: true });
const finished = D.fixtures.filter((f) => f.homeId && f.awayId);  // 양팀 확정(종료/예정 모두 시도, summary post만 기록)
let ok = 0, skip = 0, fail = 0;
for (const fx of finished) {
  try {
    const eid = await resolveEid(fx);
    if (!eid) { fail++; continue; }
    await sleep(300);
    const sum = await (await fetch(SUM + eid)).json();
    const status = (((sum.header || {}).competitions || [])[0] || {}).status;
    const ended = status && status.type && status.type.state === "post";
    const box = sum.boxscore && sum.boxscore.teams && sum.boxscore.teams.length >= 2 && (sum.boxscore.teams[0].statistics || []).length > 0;
    if (!ended || !box) { skip++; continue; }
    const rec = { rosters: sum.rosters, keyEvents: sum.keyEvents, header: sum.header, headToHeadGames: sum.headToHeadGames, boxscore: sum.boxscore, gameInfo: sum.gameInfo };
    writeFileSync(join(ROOT, "lu", fx.id + ".json"), JSON.stringify(rec));
    ok++;
    process.stdout.write(`✓ ${fx.id} ${fx.homeName}-${fx.awayName}\n`);
    await sleep(250);
  } catch (e) { fail++; }
}
console.log(`\n완료: 기록 ${ok} · 통계없음/미종료 ${skip} · 해석실패 ${fail}`);
