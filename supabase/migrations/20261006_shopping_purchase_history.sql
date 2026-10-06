-- STEP 3: Keep purchase history independent from the current shopping list.
create table if not exists public.shopping_purchase_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shopping_list_item_id uuid references public.shopping_list_items(id) on delete set null,
  name text not null,
  category text not null check (category in ('肉・魚・卵','野菜','調味料','乳製品','パン・パスタ・主食','冷凍食品','日用品','その他')),
  master_id uuid references public.shopping_master(id) on delete set null,
  purchased_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists shopping_purchase_history_user_purchased_at_idx
  on public.shopping_purchase_history(user_id, purchased_at desc);

create unique index if not exists shopping_purchase_history_current_item_idx
  on public.shopping_purchase_history(shopping_list_item_id)
  where shopping_list_item_id is not null;

alter table public.shopping_purchase_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shopping_purchase_history' and policyname = 'shopping_purchase_history_own_all'
  ) then
    create policy shopping_purchase_history_own_all on public.shopping_purchase_history
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant select, insert, update, delete on public.shopping_purchase_history to authenticated;

-- Preserve purchase records that already exist in the current shopping list.
insert into public.shopping_purchase_history
  (shopping_list_item_id, user_id, name, category, master_id, purchased_at, created_at)
select
  s.id, s.user_id, s.name, s.category, s.master_id, s.purchased_at, coalesce(s.purchased_at, s.created_at)
from public.shopping_list_items s
where s.is_purchased = true
  and s.purchased_at is not null
  and not exists (
    select 1
    from public.shopping_purchase_history h
    where h.shopping_list_item_id = s.id
  );
