alter table people enable row level security;
alter table relationships enable row level security;

create policy people_select_all on people for select using (true);
create policy relationships_select_all on relationships for select using (true);
-- Deliberately no insert/update/delete policies: every write must go through
-- a security-definer RPC function that checks the passphrase itself.

-- Base table grants mirror how Supabase/PostgREST actually authorizes anon/authenticated
-- roles: the GRANTs open up the operations, and RLS policies (or their absence) are the
-- real gate. Without these grants, a direct write from anon would be rejected at the
-- privilege-check layer with "permission denied for table ..." before RLS is ever
-- consulted, which would make an RLS-denial test meaningless (it would "pass" even with
-- RLS turned off). Granting write privileges here, then relying on the lack of
-- insert/update/delete policies above to deny every row, ensures a blocked write fails
-- specifically because of RLS ("new row violates row-level security policy"), and reads
-- stay genuinely open as intended.
grant select, insert, update, delete on people, relationships to anon, authenticated;

create table app_config (
  key   text primary key,
  value text not null
);

-- Hosted Supabase installs pgcrypto into the `extensions` schema, not `public`
-- (locally it happens to land in `public`, which is why this worked without
-- qualification during local development). This is a raw top-level statement,
-- not inside a function, so it doesn't inherit any function's search_path —
-- widen the session's search_path for this migration so crypt()/gen_salt()
-- resolve in either location. Listing a schema that doesn't exist (as
-- `extensions` won't, on a fresh local database) is not an error in Postgres;
-- it's simply skipped during name resolution.
set search_path = public, extensions;

-- Deploy-time value: replace via
--   update app_config set value = crypt('<real passphrase>', gen_salt('bf')) where key = 'passphrase_hash';
insert into app_config (key, value) values ('passphrase_hash', crypt('changeme', gen_salt('bf')));

create or replace function verify_passphrase(p_passphrase text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if p_passphrase is null then
    return false;
  end if;
  select value into v_hash from app_config where key = 'passphrase_hash';
  if v_hash is null then
    return false;
  end if;
  return v_hash = crypt(p_passphrase, v_hash);
end;
$$;

grant execute on function verify_passphrase(text) to anon, authenticated;
