create table if not exists public.gohan_workspaces (
  id uuid primary key,
  name text not null default 'ごはんOS',
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_user_id uuid
);

insert into public.gohan_workspaces (id, name)
values ('22222222-2222-2222-2222-222222222222'::uuid, 'ごはんOS')
on conflict (id) do nothing;

alter table public.recipes add column if not exists household_id uuid default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.recipe_ingredients add column if not exists household_id uuid default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.recipe_tags add column if not exists household_id uuid default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.shopping_master add column if not exists household_id uuid default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.shopping_list_items add column if not exists household_id uuid default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.shopping_purchase_history add column if not exists household_id uuid default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.ingredients add column if not exists household_id uuid default '22222222-2222-2222-2222-222222222222'::uuid;

alter table public.recipes alter column household_id set default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.recipe_ingredients alter column household_id set default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.recipe_tags alter column household_id set default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.shopping_master alter column household_id set default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.shopping_list_items alter column household_id set default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.shopping_purchase_history alter column household_id set default '22222222-2222-2222-2222-222222222222'::uuid;
alter table public.ingredients alter column household_id set default '22222222-2222-2222-2222-222222222222'::uuid;

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.shopping_master enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.shopping_purchase_history enable row level security;
alter table public.ingredients enable row level security;

drop policy if exists recipes_own_all on public.recipes;
drop policy if exists recipe_ingredients_own_all on public.recipe_ingredients;
drop policy if exists recipe_tags_own_all on public.recipe_tags;
drop policy if exists shopping_master_own_all on public.shopping_master;
drop policy if exists shopping_list_items_own_all on public.shopping_list_items;
drop policy if exists shopping_purchase_history_own_all on public.shopping_purchase_history;
drop policy if exists ingredients_own_all on public.ingredients;

create policy gohan_shared_all on public.recipes for all to authenticated using (household_id='22222222-2222-2222-2222-222222222222'::uuid) with check (household_id='22222222-2222-2222-2222-222222222222'::uuid);
create policy gohan_shared_all on public.recipe_ingredients for all to authenticated using (household_id='22222222-2222-2222-2222-222222222222'::uuid) with check (household_id='22222222-2222-2222-2222-222222222222'::uuid);
create policy gohan_shared_all on public.recipe_tags for all to authenticated using (household_id='22222222-2222-2222-2222-222222222222'::uuid) with check (household_id='22222222-2222-2222-2222-222222222222'::uuid);
create policy gohan_shared_all on public.shopping_master for all to authenticated using (household_id='22222222-2222-2222-2222-222222222222'::uuid) with check (household_id='22222222-2222-2222-2222-222222222222'::uuid);
create policy gohan_shared_all on public.shopping_list_items for all to authenticated using (household_id='22222222-2222-2222-2222-222222222222'::uuid) with check (household_id='22222222-2222-2222-2222-222222222222'::uuid);
create policy gohan_shared_all on public.shopping_purchase_history for all to authenticated using (household_id='22222222-2222-2222-2222-222222222222'::uuid) with check (household_id='22222222-2222-2222-2222-222222222222'::uuid);
create policy gohan_shared_all on public.ingredients for all to authenticated using (household_id='22222222-2222-2222-2222-222222222222'::uuid) with check (household_id='22222222-2222-2222-2222-222222222222'::uuid);

create or replace function public.gohan_pin_configured()
returns boolean language sql security definer set search_path=public as $$
  select pin_hash is not null from public.gohan_workspaces where id='22222222-2222-2222-2222-222222222222'::uuid;
$$;

create or replace function public.set_gohan_pin(p_pin text)
returns boolean language plpgsql security definer set search_path=public as $$
declare current_hash text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then return false; end if;
  select pin_hash into current_hash from public.gohan_workspaces where id='22222222-2222-2222-2222-222222222222'::uuid for update;
  if current_hash is not null then return false; end if;
  update public.gohan_workspaces
     set pin_hash=extensions.crypt(p_pin, extensions.gen_salt('bf')), updated_at=now()
   where id='22222222-2222-2222-2222-222222222222'::uuid;
  return true;
end;
$$;

create or replace function public.verify_gohan_pin(p_pin text)
returns boolean language plpgsql security definer set search_path=public as $$
declare stored_hash text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then return false; end if;
  select pin_hash into stored_hash from public.gohan_workspaces where id='22222222-2222-2222-2222-222222222222'::uuid;
  if stored_hash is null then return false; end if;
  return stored_hash = extensions.crypt(p_pin, stored_hash);
end;
$$;

grant execute on function public.gohan_pin_configured() to authenticated;
grant execute on function public.set_gohan_pin(text) to authenticated;
grant execute on function public.verify_gohan_pin(text) to authenticated;
