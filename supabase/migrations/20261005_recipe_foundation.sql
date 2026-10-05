-- Recipe foundation for Gohan OS.
-- Safe/idempotent reference migration for the STEP 0 schema.

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cooking_category text not null check (cooking_category in ('主菜','副菜','汁物','主食','デザート','その他')),
  genre text not null check (genre in ('和食','洋食','中華','韓国','エスニック','その他')),
  instructions jsonb not null default '[]'::jsonb,
  is_favorite boolean not null default false,
  make_again boolean not null default false,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  ingredient_name text not null,
  amount text,
  unit text,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.recipe_tags (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (recipe_id, tag_id)
);

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.tags enable row level security;

insert into public.tags (name) values
  ('子供向け'),('大人向け'),('家族向け'),('簡単'),('30分以内'),
  ('節約'),('作り置き'),('野菜多め'),('冷凍可能'),('お弁当向け')
on conflict (name) do nothing;

-- RLS: anonymous users receive the authenticated Postgres role.
-- Recipes and their child rows are restricted to the current auth.uid().
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recipes' and policyname = 'recipes_own_all'
  ) then
    create policy recipes_own_all on public.recipes
      for all to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recipe_ingredients' and policyname = 'recipe_ingredients_own_all'
  ) then
    create policy recipe_ingredients_own_all on public.recipe_ingredients
      for all to authenticated
      using (
        exists (
          select 1 from public.recipes r
          where r.id = recipe_ingredients.recipe_id
            and r.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.recipes r
          where r.id = recipe_ingredients.recipe_id
            and r.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recipe_tags' and policyname = 'recipe_tags_own_all'
  ) then
    create policy recipe_tags_own_all on public.recipe_tags
      for all to authenticated
      using (
        exists (
          select 1 from public.recipes r
          where r.id = recipe_tags.recipe_id
            and r.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.recipes r
          where r.id = recipe_tags.recipe_id
            and r.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'tags' and policyname = 'tags_read_authenticated'
  ) then
    create policy tags_read_authenticated on public.tags
      for select to authenticated
      using (true);
  end if;
end
$$;

-- Data API privileges required before RLS policies can be evaluated.
grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;
grant select, insert, update, delete on public.recipe_tags to authenticated;
grant select on public.tags to authenticated;
