-- On hosted Supabase, anon/authenticated get default ALL privileges on new
-- public-schema tables unless explicitly revoked. app_config holds the
-- passphrase bcrypt hash, so it must be locked down: revoke the default
-- grants and enable RLS with no policies, meaning no access at all for
-- non-owner roles. Only security definer functions (verify_passphrase) can
-- still read it.
revoke all on app_config from anon, authenticated;
alter table app_config enable row level security;

-- Hosted Supabase installs pgcrypto into the `extensions` schema, not
-- `public`, so verify_passphrase's unqualified call to crypt() would fail to
-- resolve there even though it happens to work locally (where pgcrypto lands
-- in `public`). Widen the search_path to cover both schemas.
create or replace function verify_passphrase(p_passphrase text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
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

-- Prevent duplicate edges (same type/from/to), which would otherwise produce
-- duplicate React keys and duplicate rendered patches in the tree UI.
create unique index relationships_unique_edge on relationships (type, from_id, to_id);
