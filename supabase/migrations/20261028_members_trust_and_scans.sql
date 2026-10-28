-- Rihla Members Area data: one row per verified restaurant, one row per scan.
-- Owners can read their own rows. Only Rihla (dashboard / service role) can
-- set tier, check date or AI-readable status, so the trust shown is never self-reported.

create type public.check_tier as enum ('hand_checked', 'document_verified', 'community_reported');

create table public.restaurants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name        text not null,
  owner_id    uuid references auth.users (id) on delete set null,
  tier        public.check_tier,
  checked_on  date,
  expires_on  date generated always as ((checked_on + interval '12 months')::date) stored,
  ai_readable boolean not null default false,
  offer       text not null default '15% off your first visit',
  created_at  timestamptz not null default now()
);
create index restaurants_owner_id_idx on public.restaurants (owner_id);

create table public.scans (
  id              bigint generated always as identity primary key,
  restaurant_slug text not null references public.restaurants (slug) on delete cascade,
  source          text not null default 'qr' check (source in ('qr', 'email')),
  created_at      timestamptz not null default now()
);
create index scans_slug_created_idx on public.scans (restaurant_slug, created_at desc);

alter table public.restaurants enable row level security;
alter table public.scans enable row level security;

create policy "Owners read their restaurant"
  on public.restaurants for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Anyone can log a scan"
  on public.scans for insert to anon, authenticated
  with check (true);

create policy "Owners read their scans"
  on public.scans for select to authenticated
  using (exists (
    select 1 from public.restaurants r
    where r.slug = scans.restaurant_slug and r.owner_id = (select auth.uid())
  ));

-- The site may only send the slug and source; the time is always the server's.
revoke all on public.scans from anon, authenticated;
grant insert (restaurant_slug, source) on public.scans to anon, authenticated;
grant select on public.scans to authenticated;
revoke all on public.restaurants from anon, authenticated;
grant select on public.restaurants to authenticated;
