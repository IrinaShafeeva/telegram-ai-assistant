-- Google Sheets connections are stored separately from projects so access,
-- health checks, and sharing can evolve without changing the project model.

alter table users
  add column if not exists email text;

create table if not exists project_sheets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  owner_user_id bigint not null references users(id),
  connected_by_user_id bigint references users(id),
  google_sheet_id varchar(128) not null,
  google_sheet_url text,
  status varchar(20) not null default 'active',
  last_health_check_at timestamptz,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id)
);

create table if not exists project_sheet_access (
  id uuid primary key default gen_random_uuid(),
  project_sheet_id uuid not null references project_sheets(id) on delete cascade,
  user_id bigint not null references users(id),
  email text,
  status varchar(20) not null default 'pending',
  last_error text,
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_sheet_id, user_id)
);

create index if not exists idx_project_sheets_project_id
  on project_sheets(project_id);

create index if not exists idx_project_sheet_access_user_id
  on project_sheet_access(user_id);

insert into project_sheets (
  project_id,
  owner_user_id,
  connected_by_user_id,
  google_sheet_id,
  google_sheet_url,
  status,
  created_at,
  updated_at
)
select
  id,
  owner_id,
  owner_id,
  google_sheet_id,
  google_sheet_url,
  'active',
  coalesce(created_at, now()),
  now()
from projects
where google_sheet_id is not null
on conflict (project_id) do update set
  google_sheet_id = excluded.google_sheet_id,
  google_sheet_url = excluded.google_sheet_url,
  updated_at = now();
