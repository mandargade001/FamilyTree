-- The unique index relationships_unique_edge (type, from_id, to_id) only catches an exact
-- duplicate tuple. For type = 'spouse' the edge is symmetric — (spouse, A, B) and
-- (spouse, B, A) represent the same fact — but the index treats them as distinct rows. If a
-- spouse relationship gets added from each person's own profile independently, both reversed
-- rows can end up in the table, and the client's direction-agnostic getSpouseIds would then
-- surface the same spouse twice. Add an explicit reverse-pair check in add_relationship so the
-- second (reversed) insert is rejected. This only applies to 'spouse'; parent-child is
-- intentionally directional and untouched.
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
  v_reverse_exists boolean;
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

  if p_type = 'spouse' then
    select exists(
      select 1 from relationships
      where type = 'spouse' and from_id = p_to_id and to_id = p_from_id
    ) into v_reverse_exists;

    if v_reverse_exists then
      raise exception 'this spousal relationship already exists';
    end if;
  end if;

  insert into relationships (type, from_id, to_id) values (p_type, p_from_id, p_to_id)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function add_relationship(text, text, uuid, uuid) to anon, authenticated;
