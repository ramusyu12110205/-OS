begin;

-- Re-point dependent rows before removing duplicate master registrations.
with ranked as (
  select id,
         first_value(id) over (partition by household_id, name order by created_at, id) as keep_id,
         row_number() over (partition by household_id, name order by created_at, id) as rn
  from public.shopping_master
  where household_id='22222222-2222-2222-2222-222222222222'::uuid
)
update public.shopping_list_items s
set master_id = r.keep_id
from ranked r
where s.master_id = r.id and r.rn > 1;

with ranked as (
  select id,
         first_value(id) over (partition by household_id, name order by created_at, id) as keep_id,
         row_number() over (partition by household_id, name order by created_at, id) as rn
  from public.shopping_master
  where household_id='22222222-2222-2222-222222222222'::uuid
)
update public.shopping_purchase_history h
set master_id = r.keep_id
from ranked r
where h.master_id = r.id and r.rn > 1;

-- Keep one master item per household/name.
with ranked as (
  select id,
         row_number() over (partition by household_id, name order by created_at, id) as rn
  from public.shopping_master
  where household_id='22222222-2222-2222-222222222222'::uuid
)
delete from public.shopping_master s
using ranked r
where s.id = r.id and r.rn > 1;

-- Use one canonical legacy owner for the master table so the existing
-- user_id/name upsert remains compatible across trusted devices.
update public.gohan_workspaces
set legacy_user_id = coalesce(
  legacy_user_id,
  (select user_id from public.shopping_master
   where household_id='22222222-2222-2222-222222222222'::uuid
   order by created_at, id limit 1)
), updated_at = now()
where id='22222222-2222-2222-2222-222222222222'::uuid;

update public.shopping_master
set user_id = (select legacy_user_id from public.gohan_workspaces
               where id='22222222-2222-2222-2222-222222222222'::uuid)
where household_id='22222222-2222-2222-2222-222222222222'::uuid;

-- Household-level uniqueness is the actual sharing rule.
create unique index if not exists shopping_master_household_name_key
  on public.shopping_master (household_id, name);

-- Normalize newly inserted/updated master rows to the canonical owner.
create or replace function public.gohan_normalize_shopping_master_owner()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare canonical_user uuid;
begin
  select legacy_user_id into canonical_user
  from public.gohan_workspaces
  where id='22222222-2222-2222-2222-222222222222'::uuid;
  if canonical_user is not null then
    new.user_id := canonical_user;
  end if;
  return new;
end;
$$;

drop trigger if exists shopping_master_normalize_owner on public.shopping_master;
create trigger shopping_master_normalize_owner
before insert or update on public.shopping_master
for each row execute function public.gohan_normalize_shopping_master_owner();

commit;
