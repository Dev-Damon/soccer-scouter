/* ============================================================================
 * comments.js — 킥톡 댓글 모듈 (Supabase · 정적 PWA · 백엔드 없음)
 *
 * 활성화 방법:
 *   1) Supabase 프로젝트의 URL / anon key 를 아래 CONFIG 에 입력
 *   2) index.html <head> 또는 body 끝에 supabase-js + 이 파일 로드:
 *        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *        <script src="comments.js"></script>
 *   3) 페이지 렌더 끝에서 마운트(예: 선수/경기/나라 상세):
 *        KickComments.mount(containerEl, "player:son-heung-min")
 *        KickComments.mount(containerEl, "match:match-2")
 *        KickComments.mount(containerEl, "team:south-korea")
 *
 * CONFIG 가 비어 있으면 "댓글 준비 중" 안내만 표시(사이트 깨지지 않음).
 * 보안은 Supabase RLS(comments.sql)에서 처리 — anon key 공개는 안전.
 * ==========================================================================*/
(function () {
  "use strict";

  var CONFIG = {
    url: "",       // 예: https://abcd.supabase.co
    anonKey: ""    // 예: eyJhbGciOi...
  };

  // 간단 욕설 마스킹(필요 시 확장). RLS/신고와 병행.
  var BADWORDS = ["시발", "씨발", "씨발", "개새끼", "병신", "좆", "니애미", "fuck", "shit", "asshole"];

  var sb = null;
  var user = null;
  var stylesInjected = false;

  function configured() { return !!(CONFIG.url && CONFIG.anonKey && window.supabase); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function mask(body) {
    var b = String(body || "");
    BADWORDS.forEach(function (w) {
      if (!w) return;
      var re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      b = b.replace(re, function (m) { return new Array(m.length + 1).join("*"); });
    });
    return b;
  }
  function timeago(iso) {
    try {
      var s = (Date.now() - new Date(iso).getTime()) / 1000;
      if (s < 60) return "방금";
      if (s < 3600) return Math.floor(s / 60) + "분 전";
      if (s < 86400) return Math.floor(s / 3600) + "시간 전";
      return Math.floor(s / 86400) + "일 전";
    } catch (e) { return ""; }
  }
  function uname(u) {
    var m = (u && u.user_metadata) || {};
    return m.name || m.full_name || m.nickname || (u && u.email) || "익명";
  }

  function client() {
    if (sb || !configured()) return sb;
    sb = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
    });
    return sb;
  }
  function refreshUser() {
    if (!client()) return Promise.resolve(null);
    return sb.auth.getUser()
      .then(function (r) { user = (r && r.data && r.data.user) || null; return user; })
      .catch(function () { user = null; return null; });
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────
  function mount(parentEl, threadKey) {
    if (!parentEl || !threadKey) return;
    injectStyles();
    var box = document.createElement("div");
    box.className = "cmt-box";
    parentEl.appendChild(box);
    var m = { el: box, key: threadKey };
    if (!configured()) {
      box.innerHTML = '<h3 class="cmt-h">댓글</h3><div class="cmt-soon">댓글 기능 준비 중입니다 — 로그인 설정 후 활성화됩니다.</div>';
      return;
    }
    render(m);
  }

  function render(m) {
    if (!client()) return;
    refreshUser()
      .then(function () { return load(m.key); })
      .then(function (list) { m.el.innerHTML = boxHtml(list); bind(m); })
      .catch(function () { m.el.innerHTML = '<h3 class="cmt-h">댓글</h3><div class="cmt-soon">댓글을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>'; });
  }

  function load(key) {
    return sb.from("comments").select("*").eq("thread_key", key)
      .order("created_at", { ascending: true })
      .then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }

  function toTree(list) {
    var roots = [], by = {};
    list.forEach(function (c) { c._ch = []; by[c.id] = c; });
    list.forEach(function (c) {
      if (c.parent_id && by[c.parent_id]) by[c.parent_id]._ch.push(c);
      else roots.push(c);
    });
    return roots;
  }

  function cHtml(c, isReply) {
    var mine = user && user.id === c.user_id;
    return '<div class="cmt' + (isReply ? " reply" : "") + '" data-id="' + esc(c.id) + '">' +
      '<div class="cmt-top"><span class="cmt-name">' + esc(c.name || "익명") + "</span>" +
        '<span class="cmt-time">' + timeago(c.created_at) + "</span></div>" +
      '<div class="cmt-body">' + esc(c.body) + "</div>" +
      '<div class="cmt-act">' +
        (!isReply ? '<button class="cmt-reply" data-id="' + esc(c.id) + '">답글</button>' : "") +
        (mine ? '<button class="cmt-del" data-id="' + esc(c.id) + '">삭제</button>' : "") +
      "</div>" +
      '<div class="cmt-replybox"></div>' +
      (c._ch && c._ch.length ? '<div class="cmt-children">' + c._ch.map(function (r) { return cHtml(r, true); }).join("") + "</div>" : "") +
      "</div>";
  }

  function boxHtml(list) {
    var roots = toTree(list);
    var head = user
      ? '<div class="cmt-me">' + esc(uname(user)) + ' · <button class="cmt-out">로그아웃</button></div>' +
        '<div class="cmt-form"><textarea class="cmt-ta" maxlength="1000" placeholder="댓글을 남겨보세요"></textarea><button class="cmt-send">등록</button></div>'
      : '<div class="cmt-login"><span class="cmt-login-t">로그인하고 댓글 남기기</span>' +
        '<button class="cmt-in" data-p="google">Google</button>' +
        '<button class="cmt-in kakao" data-p="kakao">카카오</button></div>';
    return '<h3 class="cmt-h">댓글 <span class="cmt-cnt">' + list.length + "</span></h3>" + head +
      '<div class="cmt-list">' +
      (roots.length ? roots.map(function (c) { return cHtml(c, false); }).join("") : '<div class="cmt-empty">첫 댓글을 남겨보세요!</div>') +
      "</div>";
  }

  function bind(m) {
    m.el.onclick = function (e) {
      var t;
      if ((t = e.target.closest(".cmt-in"))) { return signIn(t.getAttribute("data-p")); }
      if (e.target.closest(".cmt-out")) { return sb.auth.signOut().then(function () { render(m); }); }
      if (e.target.closest(".cmt-send")) { return send(m, null, m.el.querySelector(".cmt-form .cmt-ta")); }
      if ((t = e.target.closest(".cmt-reply"))) { return toggleReply(m, t.getAttribute("data-id")); }
      if ((t = e.target.closest(".cmt-del"))) { return del(m, t.getAttribute("data-id")); }
      if ((t = e.target.closest(".cmt-rsend"))) {
        var id = t.getAttribute("data-id");
        return send(m, id, t.parentNode.querySelector(".cmt-ta"));
      }
    };
  }

  function toggleReply(m, parentId) {
    var node = m.el.querySelector('.cmt[data-id="' + (window.CSS && CSS.escape ? CSS.escape(parentId) : parentId) + '"] > .cmt-replybox');
    if (!node) return;
    if (node.innerHTML) { node.innerHTML = ""; return; }
    if (!user) { alert("로그인 후 답글을 남길 수 있어요."); return; }
    node.innerHTML = '<textarea class="cmt-ta" maxlength="1000" placeholder="답글"></textarea>' +
      '<button class="cmt-rsend" data-id="' + esc(parentId) + '">답글 등록</button>';
  }

  function send(m, parentId, ta) {
    if (!ta) return;
    var body = (ta.value || "").trim();
    if (!body) return;
    if (!user) { alert("로그인이 필요합니다."); return; }
    var md = user.user_metadata || {};
    var rec = {
      thread_key: m.key, parent_id: parentId || null, user_id: user.id,
      name: uname(user), avatar: md.avatar_url || md.picture || null,
      body: mask(body).slice(0, 1000)
    };
    ta.disabled = true;
    sb.from("comments").insert(rec).then(function (r) {
      if (r.error) { alert("등록 실패: " + r.error.message); ta.disabled = false; return; }
      render(m);
    });
  }

  function del(m, id) {
    if (!confirm("댓글을 삭제할까요?")) return;
    sb.from("comments").delete().eq("id", id).then(function () { render(m); });
  }

  function signIn(provider) {
    if (!client()) return;
    sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: location.href.split("#")[0] } });
  }

  // ── 스타일(자체 주입) ───────────────────────────────────────────────────
  function injectStyles() {
    if (stylesInjected) return; stylesInjected = true;
    var css = [
      ".cmt-box{margin-top:18px;border-top:1px solid var(--line,#1e2a3a);padding-top:16px}",
      ".cmt-h{font-size:15px;font-weight:800;margin:0 0 12px}",
      ".cmt-cnt{color:var(--accent,#2ee6a6)}",
      ".cmt-soon{color:var(--muted,#9fb0c3);font-size:13px;padding:8px 0}",
      ".cmt-login{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}",
      ".cmt-login-t{color:var(--muted,#9fb0c3);font-size:13px;margin-right:auto}",
      ".cmt-in{border:1px solid var(--line,#1e2a3a);background:#fff;color:#222;font-weight:700;font-size:13px;padding:8px 14px;border-radius:10px;cursor:pointer}",
      ".cmt-in.kakao{background:#FEE500;color:#3c1e1e;border-color:#FEE500}",
      ".cmt-me{display:flex;align-items:center;gap:8px;color:var(--muted,#9fb0c3);font-size:12.5px;margin-bottom:10px}",
      ".cmt-out{background:none;border:0;color:var(--muted,#9fb0c3);text-decoration:underline;cursor:pointer;font-size:12px}",
      ".cmt-form{display:flex;gap:8px;margin-bottom:14px}",
      ".cmt-replybox{margin:6px 0 0 0}",
      ".cmt-ta{flex:1;min-height:44px;resize:vertical;background:var(--bg-soft,#0f1a2a);color:var(--text,#fff);border:1px solid var(--line,#1e2a3a);border-radius:10px;padding:10px 12px;font:inherit;font-size:14px}",
      ".cmt-send,.cmt-rsend{align-self:flex-end;background:var(--accent,#2ee6a6);color:#06281d;font-weight:800;border:0;border-radius:10px;padding:0 16px;height:44px;cursor:pointer}",
      ".cmt-rsend{height:36px;margin-top:6px;font-size:13px}",
      ".cmt-list{display:flex;flex-direction:column;gap:14px}",
      ".cmt-empty{color:var(--muted,#9fb0c3);font-size:13px;padding:8px 0}",
      ".cmt{}",
      ".cmt-top{display:flex;align-items:baseline;gap:8px}",
      ".cmt-name{font-weight:700;font-size:13.5px}",
      ".cmt-time{color:var(--muted,#9fb0c3);font-size:11.5px}",
      ".cmt-body{font-size:14px;line-height:1.5;margin:3px 0;white-space:pre-wrap;word-break:break-word}",
      ".cmt-act{display:flex;gap:12px}",
      ".cmt-act button{background:none;border:0;color:var(--muted,#9fb0c3);font-size:12px;cursor:pointer;padding:0}",
      ".cmt-children{margin:10px 0 0 16px;padding-left:12px;border-left:2px solid var(--line,#1e2a3a);display:flex;flex-direction:column;gap:12px}",
      ".cmt.reply .cmt-body{font-size:13.5px}"
    ].join("");
    var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  }

  window.KickComments = { mount: mount, configured: configured };
})();
