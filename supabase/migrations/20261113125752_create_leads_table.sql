-- Leads from the public website forms (index.html).
-- Applied to the live project (jklawobuebcqpteekclz) on 2026-11-13.
-- The site can only ADD rows. Nobody can read, change or delete them with the
-- site's public key. Read them in the Supabase dashboard (Table Editor > leads).

create table public.leads (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  -- owner_claim: "Claim your spot" form. diner_list: NYC list sign-up.
  -- visibility_check: restaurant name typed into the Halal Visibility Check box.
  kind           text not null,
  restaurant     text,
  contact_name   text,
  phone          text,
  email          text,
  area           text,
  -- first campaign that brought the visitor (utm values), when there was one
  first_source   text,
  first_medium   text,
  first_campaign text,
  -- page address the form was sent from, without anything after "#"
  page           text,

  constraint leads_kind_known check (kind in ('owner_claim', 'diner_list', 'visibility_check')),
  constraint leads_fields_not_oversized check (
        coalesce(char_length(restaurant), 0)     <= 200
    and coalesce(char_length(contact_name), 0)   <= 200
    and coalesce(char_length(phone), 0)          <= 40
    and coalesce(char_length(email), 0)          <= 320
    and coalesce(char_length(area), 0)           <= 100
    and coalesce(char_length(first_source), 0)   <= 200
    and coalesce(char_length(first_medium), 0)   <= 200
    and coalesce(char_length(first_campaign), 0) <= 200
    and coalesce(char_length(page), 0)           <= 500
  ),
  constraint leads_email_looks_valid check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint leads_has_what_its_kind_needs check (
       (kind = 'owner_claim'      and nullif(btrim(restaurant), '') is not null
                                  and nullif(btrim(contact_name), '') is not null
                                  and (nullif(btrim(phone), '') is not null or email is not null))
    or (kind = 'diner_list'       and email is not null)
    or (kind = 'visibility_check' and nullif(btrim(restaurant), '') is not null)
  )
);

comment on table public.leads is 'Leads from the public website forms. Insert-only for the site; read in the dashboard.';

create index leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

-- The website (anonymous visitors, or a signed-in owner) may add a lead. Nothing else.
revoke all on table public.leads from anon, authenticated;
grant insert on table public.leads to anon, authenticated;

create policy "Website visitors can submit a lead"
  on public.leads
  for insert
  to anon, authenticated
  with check (true);

-- No select, update or delete policy exists, so with row level security on,
-- the public key can never read, change or remove a lead.
