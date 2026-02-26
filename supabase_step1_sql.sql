-- Pegar en Supabase > SQL Editor

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_state jsonb not null default '{"courses":{},"selectedCourseId":null,"selectedDate":null}'::jsonb,
  teacher_profile jsonb not null default '{"name":"","article":"la"}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_app_state_updated_at on public.user_app_state;
create trigger trg_user_app_state_updated_at
before update on public.user_app_state
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_app_state enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "state_select_own" on public.user_app_state;
create policy "state_select_own" on public.user_app_state for select to authenticated using (auth.uid() = user_id);

drop policy if exists "state_insert_own" on public.user_app_state;
create policy "state_insert_own" on public.user_app_state for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "state_update_own" on public.user_app_state;
create policy "state_update_own" on public.user_app_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
