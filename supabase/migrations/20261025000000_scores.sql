-- Stack Quiz leaderboard.
-- One shared Supabase project can host several apps, so everything lives in its own schema.
create schema if not exists trivia;
grant usage on schema trivia to anon, authenticated;

create table trivia.scores (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  nickname   text        not null check (char_length(btrim(nickname)) between 1 and 24),
  mode       text        not null check (mode in ('daily', 'practice')),
  day        date        not null default current_date,
  points     integer     not null check (points >= 0),
  correct    smallint    not null check (correct >= 0),
  total      smallint    not null check (total between 1 and 20),
  created_at timestamptz not null default now(),
  -- Scores are self-reported by the browser, so cap them at what the game can award
  -- (200 points per question) and keep the counts consistent.
  constraint scores_plausible check (correct <= total and points <= total * 200)
);

-- A player may post one Daily score per day; practice scores are not limited.
create unique index scores_one_daily_per_user on trivia.scores (user_id, day) where mode = 'daily';
create index scores_daily_ranking on trivia.scores (day, points desc) where mode = 'daily';

alter table trivia.scores enable row level security;

-- The leaderboard is public.
create policy "anyone can read scores" on trivia.scores
  for select to anon, authenticated using (true);

-- Players (anonymous sign-in counts) can add scores only as themselves.
create policy "players insert their own scores" on trivia.scores
  for insert to authenticated with check (user_id = auth.uid());

-- Players can delete their own scores ("forget me"). No updates: a score is never edited.
create policy "players delete their own scores" on trivia.scores
  for delete to authenticated using (user_id = auth.uid());

grant select on trivia.scores to anon, authenticated;
grant insert, delete on trivia.scores to authenticated;
grant usage on all sequences in schema trivia to authenticated;

-- Today's top scores without exposing user ids.
create view trivia.daily_top with (security_invoker = true) as
  select nickname, points, correct, total, day
  from trivia.scores
  where mode = 'daily'
  order by day desc, points desc, created_at asc;

grant select on trivia.daily_top to anon, authenticated;
