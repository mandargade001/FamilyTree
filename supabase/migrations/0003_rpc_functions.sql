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
