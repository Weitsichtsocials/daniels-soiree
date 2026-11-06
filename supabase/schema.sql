-- ─────────────────────────────────────────────────────────────
--  Daniel’s Soirée – Supabase-Schema
--  Einmal komplett im Supabase SQL Editor ausführen.
--  Gäste (anon) dürfen nur EINREICHEN. Lesen, Ändern und Löschen
--  darf ausschließlich ein Admin aus der Tabelle admin_users.
--  IDs und Zeitstempel kommen vom iPad, damit Einträge, die bei
--  schlechtem WLAN nachgesendet werden, nie doppelt landen.
-- ─────────────────────────────────────────────────────────────

-- Admins ---------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

drop policy if exists "admin reads admins" on public.admin_users;
create policy "admin reads admins" on public.admin_users
  for select to authenticated using (user_id = auth.uid());

-- Gästebuch --------------------------------------------------------
create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  guest_name text check (char_length(guest_name) <= 80),
  message text not null check (char_length(message) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- Baby Predictions -------------------------------------------------
create table if not exists public.baby_predictions (
  id uuid primary key default gen_random_uuid(),
  guest_name text check (char_length(guest_name) <= 80),
  gender text check (gender in ('girl','boy')),
  birth_date date,
  weight_grams int check (weight_grams between 500 and 7000),
  length_cm int check (length_cm between 30 and 70),
  looks_like text check (looks_like in ('papa','mama','both')),
  name_suggestion text check (char_length(name_suggestion) <= 80),
  wish text check (char_length(wish) <= 400),
  created_at timestamptz not null default now()
);

-- Party-Quiz -------------------------------------------------------
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  guest_name text check (char_length(guest_name) <= 80),
  score int not null,
  total int not null,
  answers jsonb,
  created_at timestamptz not null default now()
);

-- Party Beichten ---------------------------------------------------
create table if not exists public.confessions (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(content) between 1 and 500),
  prompt text check (char_length(prompt) <= 200),
  is_read boolean not null default false,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

-- Row Level Security ----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['guestbook_entries','baby_predictions','quiz_results','confessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "guests insert" on public.%I', t);
    execute format('drop policy if exists "admin select" on public.%I', t);
    execute format('drop policy if exists "admin update" on public.%I', t);
    execute format('drop policy if exists "admin delete" on public.%I', t);
    execute format('create policy "guests insert" on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "admin select" on public.%I for select to authenticated using (public.is_admin())', t);
    execute format('create policy "admin update" on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admin delete" on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- Rechte für die Daten-API (RLS oben regelt, was davon greift)
grant usage on schema public to anon, authenticated;
grant insert on public.guestbook_entries, public.baby_predictions, public.quiz_results, public.confessions to anon, authenticated;
grant select, update, delete on public.guestbook_entries, public.baby_predictions, public.quiz_results, public.confessions to authenticated;
grant select on public.admin_users to authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- Gäste dürfen bei Beichten nur den Text einreichen, nicht schon
-- "gelesen"/"Favorit" setzen.
create or replace function public.confession_defaults()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() then
    new.is_read := false;
    new.is_favorite := false;
  end if;
  return new;
end $$;
drop trigger if exists confession_defaults on public.confessions;
create trigger confession_defaults before insert on public.confessions
  for each row execute function public.confession_defaults();

-- Quiz-Platzierung: Gäste erfahren nur IHREN Platz, nicht wer vorne liegt.
-- Alle Runden eines Namens zählen zusammen; Rang = Trefferquote.
drop function if exists public.quiz_top5();
drop function if exists public.quiz_rank(uuid);
create or replace function public.quiz_rank(p_name text)
returns table (rank int, total int, correct int, answered int)
language sql stable security definer set search_path = public as $$
  with p as (
    select lower(regexp_replace(trim(coalesce(guest_name, 'Anonym')), '\s+', ' ', 'g')) as k,
           sum(score) as c, sum(total) as a, min(created_at) as f
    from public.quiz_results group by 1
  ), r as (
    select k, c, a,
           row_number() over (order by c::float / nullif(a, 0) desc nulls last, a desc, f asc)::int as rnk
    from p
  )
  select r.rnk, (select count(*)::int from p), r.c::int, r.a::int
  from r where r.k = lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
$$;
grant execute on function public.quiz_rank(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
--  NACH dem Anlegen deines Admin-Users (Authentication → Users →
--  "Add user") diese Zeile mit deiner E-Mail ausführen:
--
--  insert into public.admin_users (user_id)
--  select id from auth.users where email = 'DEINE@EMAIL.de';
-- ─────────────────────────────────────────────────────────────
