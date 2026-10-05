-- Shopping foundation for Gohan OS STEP 3.
-- Separate frequent-buy master data from current shopping-list items.

create table if not exists public.shopping_master (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  category text not null check (category in ('肉・魚・卵','野菜','調味料','乳製品','パン・パスタ・主食','冷凍食品','日用品','その他')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  master_id uuid references public.shopping_master(id) on delete set null,
  name text not null,
  category text not null check (category in ('肉・魚・卵','野菜','調味料','乳製品','パン・パスタ・主食','冷凍食品','日用品','その他')),
  is_purchased boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shopping_master enable row level security;
alter table public.shopping_list_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shopping_master' and policyname = 'shopping_master_own_all'
  ) then
    create policy shopping_master_own_all on public.shopping_master
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shopping_list_items' and policyname = 'shopping_list_items_own_all'
  ) then
    create policy shopping_list_items_own_all on public.shopping_list_items
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant select, insert, update, delete on public.shopping_master to authenticated;
grant select, insert, update, delete on public.shopping_list_items to authenticated;
