alter table public.players
  add column if not exists last_seen timestamptz not null default timezone('utc', now());

create unique index if not exists players_game_id_pseudo_lower_idx
  on public.players (game_id, lower(pseudo));

create unique index if not exists answers_question_id_player_id_idx
  on public.answers (question_id, player_id);

create index if not exists players_game_id_joined_at_idx
  on public.players (game_id, joined_at);

create index if not exists players_game_id_last_seen_idx
  on public.players (game_id, last_seen desc);

create index if not exists questions_game_id_question_number_idx
  on public.questions (game_id, question_number);

create index if not exists answers_game_id_question_id_idx
  on public.answers (game_id, question_id);
