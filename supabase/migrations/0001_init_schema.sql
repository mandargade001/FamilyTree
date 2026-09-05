create extension if not exists pgcrypto;

create table people (
  id            uuid primary key default gen_random_uuid(),
  first_name    text not null,
  last_name     text,
  gender        text,
  birth_date    text,
  death_date    text,
  birth_place   text,
  occupation    text,
  bio           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table relationships (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('parent-child', 'spouse')),
  from_id    uuid not null references people(id) on delete cascade,
  to_id      uuid not null references people(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index relationships_from_id_idx on relationships(from_id);
create index relationships_to_id_idx on relationships(to_id);
