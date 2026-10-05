-- STEP 3.1: shopping master management and purchase date history.

alter table public.shopping_list_items
  add column if not exists purchased_at timestamptz;

-- Existing purchased rows receive their update timestamp as a best-effort historical date.
update public.shopping_list_items
set purchased_at = coalesce(purchased_at, updated_at, created_at)
where is_purchased = true and purchased_at is null;
