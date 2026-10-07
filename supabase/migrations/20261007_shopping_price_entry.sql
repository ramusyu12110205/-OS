-- ごはんOS: 購入価格記録のための追加基盤
-- 既存データ・既存UIを壊さず、店舗の論理削除と将来の価格入力を支える。

alter table public.shopping_stores
  add column if not exists is_active boolean not null default true;

create unique index if not exists shopping_products_household_name_spec_unit_key
  on public.shopping_products (household_id, name, coalesce(specification, ''), coalesce(unit, ''));

create unique index if not exists shopping_stores_household_name_key
  on public.shopping_stores (household_id, name);

create index if not exists shopping_purchase_history_product_store_idx
  on public.shopping_purchase_history (product_id, store_id, purchased_at desc);

create index if not exists shopping_list_items_product_idx
  on public.shopping_list_items (product_id);

-- 店舗は履歴を残したまま非表示にできる。
-- 既存RLSは変更しない。
