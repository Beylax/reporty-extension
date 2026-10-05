begin;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  primary key (project_id, user_id)
);
create table public.environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  origin text not null check (origin ~ '^https?://[^/?#]+$'),
  created_at timestamptz not null default now(),
  unique (project_id, origin),
  unique (id, project_id)
);
-- Tokens are hashed by the server. Never expose invitation/session rows to clients.
create table public.guest_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (id, project_id)
);
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invite_id uuid not null,
  token_hash text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  foreign key (invite_id, project_id) references public.guest_invites(id, project_id) on delete cascade,
  unique (id, project_id)
);
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  environment_id uuid not null,
  page_path text not null,
  body text not null check (char_length(body) between 1 and 10000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  author_id uuid references auth.users(id),
  guest_session_id uuid,
  context jsonb not null check (jsonb_typeof(context) = 'object'),
  screenshot_path text,
  created_at timestamptz not null default now(),
  foreign key (environment_id, project_id) references public.environments(id, project_id),
  foreign key (guest_session_id, project_id) references public.guest_sessions(id, project_id),
  check (num_nonnulls(author_id, guest_session_id) = 1),
  unique (id, project_id)
);
create index issues_page on public.issues(environment_id, page_path, created_at);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  issue_id uuid not null,
  body text not null check (char_length(body) between 1 and 10000),
  author_id uuid references auth.users(id),
  guest_session_id uuid,
  created_at timestamptz not null default now(),
  foreign key (issue_id, project_id) references public.issues(id, project_id) on delete cascade,
  foreign key (guest_session_id, project_id) references public.guest_sessions(id, project_id),
  check (num_nonnulls(author_id, guest_session_id) = 1)
);
create index comments_issue on public.comments(issue_id, created_at);
create index members_user on public.project_members(user_id);

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$$;
create function public.can_read_project(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists(
    select 1 from public.project_members where project_id = target and user_id = auth.uid()
  );
$$;
create function public.can_manage_project(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists(
    select 1 from public.project_members where project_id = target and user_id = auth.uid() and role = 'admin'
  );
$$;
revoke all on function public.is_platform_admin(), public.can_read_project(uuid), public.can_manage_project(uuid) from public;
grant execute on function public.is_platform_admin(), public.can_read_project(uuid), public.can_manage_project(uuid) to authenticated;

create function public.add_project_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members(project_id, user_id, role) values (new.id, new.created_by, 'admin');
  return new;
end;
$$;
revoke all on function public.add_project_owner() from public;
create trigger project_owner after insert on public.projects for each row execute function public.add_project_owner();

alter table public.platform_admins enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.environments enable row level security;
alter table public.guest_invites enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.issues enable row level security;
alter table public.comments enable row level security;

-- Writes go through forthcoming authenticated API functions. Direct clients can
-- create projects, read authorized data and create their own reports/comments.
revoke all on public.platform_admins, public.guest_invites, public.guest_sessions from anon, authenticated;
revoke all on public.projects, public.project_members, public.environments, public.issues, public.comments from anon, authenticated;
grant select, insert on public.projects to authenticated;
grant select on public.project_members, public.environments to authenticated;
grant select, insert on public.issues, public.comments to authenticated;

create policy project_read on public.projects for select to authenticated using (public.can_read_project(id));
create policy project_create on public.projects for insert to authenticated with check (
  created_by = auth.uid() and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
);
create policy member_read on public.project_members for select to authenticated using (public.can_read_project(project_id));
create policy environment_read on public.environments for select to authenticated using (public.can_read_project(project_id));
create policy issue_read on public.issues for select to authenticated using (public.can_read_project(project_id));
create policy issue_create on public.issues for insert to authenticated with check (
  public.can_read_project(project_id) and author_id = auth.uid() and guest_session_id is null and status = 'open' and screenshot_path is null
);
create policy comment_read on public.comments for select to authenticated using (public.can_read_project(project_id));
create policy comment_create on public.comments for insert to authenticated with check (
  public.can_read_project(project_id) and author_id = auth.uid() and guest_session_id is null
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 10485760, array['image/png', 'image/jpeg', 'image/webp']);
-- Storage has no client policies yet: screenshots will be served by authorized API.
commit;
