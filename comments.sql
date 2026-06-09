-- ============================================================================
-- 킥톡 댓글 기능 — Supabase 스키마 + 보안(RLS)
-- 사용: Supabase 대시보드 → SQL Editor에 붙여넣고 Run
-- ============================================================================

-- 댓글 테이블
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  thread_key  text not null,                                   -- 'match:<id>' | 'team:<id>' | 'player:<id>'
  parent_id   uuid references public.comments(id) on delete cascade,  -- 대댓글이면 부모 id
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  avatar      text,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index if not exists comments_thread_idx on public.comments(thread_key, created_at);

alter table public.comments enable row level security;

-- 읽기: 누구나
drop policy if exists "comments read all" on public.comments;
create policy "comments read all" on public.comments for select using (true);
-- 작성: 로그인한 본인만(user_id = 내 uid)
drop policy if exists "comments insert own" on public.comments;
create policy "comments insert own" on public.comments for insert with check (auth.uid() = user_id);
-- 수정/삭제: 작성자 본인만
drop policy if exists "comments update own" on public.comments;
create policy "comments update own" on public.comments for update using (auth.uid() = user_id);
drop policy if exists "comments delete own" on public.comments;
create policy "comments delete own" on public.comments for delete using (auth.uid() = user_id);

-- 신고 테이블(선택)
create table if not exists public.comment_reports (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments(id) on delete cascade,
  reporter    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(comment_id, reporter)
);
alter table public.comment_reports enable row level security;
drop policy if exists "reports insert own" on public.comment_reports;
create policy "reports insert own" on public.comment_reports for insert with check (auth.uid() = reporter);
drop policy if exists "reports read own" on public.comment_reports;
create policy "reports read own" on public.comment_reports for select using (auth.uid() = reporter);
