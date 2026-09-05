create or replace function add_person(
  p_passphrase   text,
  p_first_name   text,
  p_last_name    text default null,
  p_gender       text default null,
  p_birth_date   text default null,
  p_death_date   text default null,
  p_birth_place  text default null,
  p_occupation   text default null,
  p_bio          text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'first name is required';
  end if;

  insert into people (first_name, last_name, gender, birth_date, death_date, birth_place, occupation, bio)
  values (p_first_name, p_last_name, p_gender, p_birth_date, p_death_date, p_birth_place, p_occupation, p_bio)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function add_person(text, text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function update_person(
  p_passphrase   text,
  p_id           uuid,
  p_first_name   text,
  p_last_name    text default null,
  p_gender       text default null,
  p_birth_date   text default null,
  p_death_date   text default null,
  p_birth_place  text default null,
  p_occupation   text default null,
  p_bio          text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  if p_first_name is null or length(trim(p_first_name)) = 0 then
    raise exception 'first name is required';
  end if;

  update people set
    first_name = p_first_name,
    last_name = p_last_name,
    gender = p_gender,
    birth_date = p_birth_date,
    death_date = p_death_date,
    birth_place = p_birth_place,
    occupation = p_occupation,
    bio = p_bio,
    updated_at = now()
  where id = p_id;

  if not found then
    raise exception 'person not found';
  end if;
end;
$$;

grant execute on function update_person(text, uuid, text, text, text, text, text, text, text, text) to anon, authenticated;

create or replace function delete_person(p_passphrase text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  delete from people where id = p_id;
  if not found then
    raise exception 'person not found';
  end if;
end;
$$;

grant execute on function delete_person(text, uuid) to anon, authenticated;

create or replace function delete_relationship(p_passphrase text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  delete from relationships where id = p_id;
  if not found then
    raise exception 'relationship not found';
  end if;
end;
$$;

grant execute on function delete_relationship(text, uuid) to anon, authenticated;

create or replace function add_relationship(
  p_passphrase text,
  p_type       text,
  p_from_id    uuid,
  p_to_id      uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_would_cycle boolean;
begin
  if not verify_passphrase(p_passphrase) then
    raise exception 'incorrect passphrase';
  end if;
  if p_type not in ('parent-child', 'spouse') then
    raise exception 'invalid relationship type: %', p_type;
  end if;
  if p_from_id = p_to_id then
    raise exception 'a person cannot be related to themselves';
  end if;

  if p_type = 'parent-child' then
    -- p_from_id is the proposed parent, p_to_id is the proposed child.
    -- Reject if p_from_id is already a descendant of p_to_id — that would
    -- make the new "parent" also a descendant of their own new "child".
    with recursive descendants as (
      select to_id as id from relationships where type = 'parent-child' and from_id = p_to_id
      union
      select r.to_id from relationships r
      join descendants d on r.from_id = d.id
      where r.type = 'parent-child'
    )
    select exists(select 1 from descendants where id = p_from_id) into v_would_cycle;

    if v_would_cycle then
      raise exception 'this relationship would make one person their own ancestor';
    end if;
  end if;

  insert into relationships (type, from_id, to_id) values (p_type, p_from_id, p_to_id)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function add_relationship(text, text, uuid, uuid) to anon, authenticated;
