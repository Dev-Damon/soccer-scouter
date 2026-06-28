// Supabase app_data → 정적 results.json + stats.json 스냅샷 생성.
// 목적: 앱이 종료경기 결과·통계를 Supabase(무료한도 egress) 대신 GitHub Pages(무료 CDN)에서 로드하게 → egress 대폭 절감 + "-" 깜빡임 제거.
// 운영: settle/stats 갱신 후(또는 cron/Actions) 실행해 커밋. 생성 시에도 필요한 행만 조회해 egress 최소화.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL = process.env.SUPABASE_URL || "https://jhzchgvnkwdroxfrgjvm.supabase.co";
const KEY = process.env.SUPABASE_KEY || "sb_publishable_AsDWJPjKDg1S5wqezB9Vtw_uxKFmE26"; // 공개 anon(RLS 보호)
const H = { apikey: KEY, Authorization: "Bearer " + KEY };

async function q(qs) {
  const r = await fetch(`${URL}/rest/v1/app_data?${qs}`, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// 1) results.json — match_results 한 행
const mr = await q("key=eq.match_results&select=data");
const results = (mr[0] && mr[0].data) || {};
writeFileSync(join(ROOT, "results.json"), JSON.stringify(results));
console.log("results.json:", Object.keys(results).length, "경기");

// 2) stats.json — stats:* 행만 집계(matchStats()와 동일 로직)
const rows = await q("key=like.stats:*&select=key,data");
const agg = {};
rows.forEach((row) => {
  ((row.data && row.data.players) || []).forEach((p) => {
    const k = p.key || p.pid || ("n:" + p.name);
    const a = agg[k] || (agg[k] = { name: p.name, team: p.team, flag: p.flag, pid: p.pid || null, goals: 0, assists: 0, og: 0, yellow: 0, red: 0, apps: 0 });
    ["goals", "assists", "og", "yellow", "red", "apps"].forEach((f) => { a[f] += (p[f] || 0); });
    if (!a.flag && p.flag) { a.flag = p.flag; a.team = p.team; }
  });
});
const stats = { players: Object.keys(agg).map((k) => agg[k]) };
writeFileSync(join(ROOT, "stats.json"), JSON.stringify(stats));
console.log("stats.json:", stats.players.length, "선수");
console.log("완료 — results.json/stats.json 커밋하면 앱이 정적으로 로드(Supabase egress 회피).");
