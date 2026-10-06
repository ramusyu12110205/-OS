-- Ingredient foundation for Gohan OS STEP 4.
-- Keep ingredient registration independent from current availability.

create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('肉・魚・卵','野菜','調味料','乳製品','パン・パスタ・主食','冷凍食品','その他')),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.ingredients enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ingredients' and policyname = 'ingredients_own_all'
  ) then
    create policy ingredients_own_all on public.ingredients
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant select, insert, update, delete on public.ingredients to authenticated;
