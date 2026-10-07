-- Future-ready DB foundation for shopping product/store/price data.
-- No UI behavior is changed by this migration.
-- shopping_master remains a shortcut master, not a product master.

create table if not exists public.shopping_products (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default '22222222-2222-2222-2222-222222222222'::uuid,
  name text not null,
  specification text,
  unit text,
  category text check (category in ('肉・魚・卵','野菜','調味料','乳製品','パン・パスタ・主食','冷凍食品','日用品','その他')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shopping_stores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default '22222222-2222-2222-2222-222222222222'::uuid,
  name text not null,
  address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  store_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_products_household_idx on public.shopping_products(household_id);
create index if not exists shopping_products_name_idx on public.shopping_products(household_id, name);
create index if not exists shopping_stores_household_idx on public.shopping_stores(household_id);
create index if not exists shopping_stores_name_idx on public.shopping_stores(household_id, name);

alter table public.shopping_list_items
  add column if not exists product_id uuid references public.shopping_products(id) on delete set null;

alter table public.shopping_purchase_history
  add column if not exists product_id uuid references public.shopping_products(id) on delete set null,
  add column if not exists store_id uuid references public.shopping_stores(id) on delete set null,
  add column if not exists quantity numeric(12,3),
  add column if not exists purchase_price numeric(12,2),
  add column if not exists specification text,
  add column if not exists unit text;

create index if not exists shopping_list_items_product_idx
  on public.shopping_list_items(product_id);
create index if not exists shopping_purchase_history_product_idx
  on public.shopping_purchase_history(product_id, purchased_at desc);
create index if not exists shopping_purchase_history_store_idx
  on public.shopping_purchase_history(store_id, purchased_at desc);

alter table public.shopping_products enable row level security;
alter table public.shopping_stores enable row level security;

create policy gohan_shared_all on public.shopping_products
  for all to authenticated
  using (household_id = '22222222-2222-2222-2222-222222222222'::uuid)
  with check (household_id = '22222222-2222-2222-2222-222222222222'::uuid);

create policy gohan_shared_all on public.shopping_stores
  for all to authenticated
  using (household_id = '22222222-2222-2222-2222-222222222222'::uuid)
  with check (household_id = '22222222-2222-2222-2222-222222222222'::uuid);

grant select, insert, update, delete on public.shopping_products to authenticated;
grant select, insert, update, delete on public.shopping_stores to authenticated;
