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

-- RLS policies are managed in the live project and should remain user-owned.
