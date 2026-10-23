-- DESTRUCTIVE: run manually in Supabase SQL Editor.
-- Deletes all Reporty data and ALL Auth users. No administrator is preserved.
-- Empty the screenshots bucket via Supabase Storage first (keep the bucket).
-- Managed auth/storage schemas, OAuth settings and unrelated public objects stay intact.
begin;

do $$
begin
  if exists(select 1 from storage.objects where bucket_id in ('screenshots','attachments','report-attachments')) then
    raise exception 'Reset annullato: svuota prima i bucket screenshots, attachments e report-attachments tramite Supabase Storage, senza eliminare il bucket.';
  end if;
end;
$$;

-- Remove only Reporty functions, including retired invitations and admin roles.
do $$
declare item record;
begin
  for item in select p.oid::regprocedure::text as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('require_reviewer_name','reviewer_identity','attachment_operation','report_attachment_operation','notify_issue_reply','notification_operation','notification_page','notify_issue_status','list_project_participants','widget_config','widget_authorize','start_widget_session','add_environment_widget','create_project_with_production','is_platform_admin','can_read_project','can_manage_project','add_project_owner','create_member_invite','accept_member_invite','create_guest_invite','revoke_project_invite','list_project_members','preview_guest_invite','start_guest_session','get_guest_session','create_member_handoff','create_guest_handoff','redeem_extension_handoff','extension_context','revoke_extension_session','report_actor','report_operation','report_page','report_pins','report_text_sort','manage_project_member','platform_delete_resource','create_environment_guest_invite','preview_guest_review','save_project_review_link','create_environment_review_link','regenerate_environment_review_link')
  loop execute format('drop function if exists %s cascade',item.signature); end loop;
end;
$$;

drop table if exists public.notifications, public.widget_sessions, public.environment_widgets, public.environment_review_links, public.project_review_links,
 public.extension_handoffs, public.extension_sessions, public.issue_attachments, public.comment_attachments, public.comments, public.issues,
 public.member_invites, public.guest_sessions, public.guest_invites,
 public.environments, public.project_members, public.projects, public.platform_admins cascade;

-- Supabase cascades Auth identities and sessions; accounts can sign up again.
delete from auth.users;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
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
  environment_id uuid references public.environments(id) on delete set null,
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
  display_name text check (char_length(display_name) between 1 and 80),
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
  priority text not null default 'medium' check(priority in ('low','medium','high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'validation', 'resolved')),
  author_id uuid references auth.users(id),
  guest_session_id uuid,
  context jsonb not null check (jsonb_typeof(context) = 'object'),
  screenshot_path text,
  screenshot_paths text[] not null default '{}' check(cardinality(screenshot_paths)<=5),
  created_at timestamptz not null default now(),
  foreign key (environment_id, project_id) references public.environments(id, project_id),
  foreign key (guest_session_id, project_id) references public.guest_sessions(id, project_id),
  check (num_nonnulls(author_id, guest_session_id) = 1),
  unique (id, project_id)
);
alter table public.issues
  add column updated_at timestamptz,
  add column updated_by uuid references auth.users(id),
  add column updated_guest_session_id uuid,
  add constraint issues_updated_guest_project_fkey foreign key (updated_guest_session_id,project_id) references public.guest_sessions(id,project_id),
  add constraint issues_update_actor_check check (
    (updated_at is null and num_nonnulls(updated_by,updated_guest_session_id)=0) or
    (updated_at is not null and num_nonnulls(updated_by,updated_guest_session_id)=1)
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

create table public.comment_attachments (
  id uuid primary key,
  issue_id uuid not null references public.issues(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  removing boolean not null default false,
  author_id uuid references auth.users(id),
  guest_session_id uuid references public.guest_sessions(id),
  name text not null check(char_length(name) between 1 and 255),
  mime text not null check(char_length(mime) between 1 and 120),
  size integer not null check(size between 1 and 2500000),
  path text not null unique,
  created_at timestamptz not null default now(),
  check(num_nonnulls(author_id,guest_session_id)=1)
);
create index comment_attachments_issue on public.comment_attachments(issue_id);
create index comment_attachments_comment on public.comment_attachments(comment_id);
alter table public.comment_attachments enable row level security;
revoke all on public.comment_attachments from public,anon,authenticated;



create table if not exists public.issue_attachments (
  id uuid primary key,
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_id uuid references auth.users(id),
  guest_session_id uuid references public.guest_sessions(id),
  name text not null check(char_length(name) between 1 and 255),
  mime text not null default 'application/octet-stream' check(mime='application/octet-stream'),
  size integer not null check(size between 1 and 5000000),
  path text not null unique,
  committed boolean not null default false,
  removing boolean not null default false,
  created_at timestamptz not null default now(),
  check(num_nonnulls(author_id,guest_session_id)=1)
);
create index if not exists issue_attachments_issue on public.issue_attachments(issue_id);
alter table public.issue_attachments enable row level security;
revoke all on public.issue_attachments from public,anon,authenticated;

create table public.extension_handoffs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '60 seconds',
  used_at timestamptz,
  check (num_nonnulls(user_id, guest_session_id) = 1)
);
create table public.extension_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  check (num_nonnulls(user_id, guest_session_id) = 1)
);
create table public.environment_review_links (
  environment_id uuid primary key references public.environments(id) on delete cascade,
  invite_id uuid not null unique references public.guest_invites(id),
  token text not null unique check(token ~ '^[0-9a-f]{64}$')
);

create or replace function public.can_read_project(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
$$;
create or replace function public.can_manage_project(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_project(target);
$$;
create function public.start_guest_session(secret text, guest_name text, session_secret text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.guest_invites; result uuid;
begin
  if (guest_name is not null and length(trim(guest_name)) not between 1 and 80) or
     session_secret is null or session_secret !~ '^[0-9a-f]{64}$' then raise exception 'Invalid guest details'; end if;
  select * into invitation from public.guest_invites
  where token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') and revoked_at is null for share;
  if invitation.id is null then raise exception 'Invalid invitation' using errcode = '42501'; end if;
  insert into public.guest_sessions(project_id, invite_id, token_hash, display_name)
  values (invitation.project_id, invitation.id, encode(sha256(convert_to(session_secret, 'UTF8')), 'hex'), trim(guest_name))
  returning id into result;
  return result;
end;
$$;
create function public.get_guest_session(secret text)
returns table(session_id uuid, project_id uuid, project_name text, display_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.project_id, p.name, s.display_name from public.guest_sessions s
  join public.guest_invites i on i.id = s.invite_id and i.project_id = s.project_id
  join public.projects p on p.id = s.project_id
  where s.token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') and i.revoked_at is null;
$$;
create function public.preview_guest_review(secret text) returns table(project_id uuid, project_name text, environment_id uuid, environment_name text, origin text)
language sql stable security definer set search_path = '' as $$
  select p.id,p.name,e.id,e.name,e.origin from public.guest_invites i
  join public.projects p on p.id=i.project_id join public.environments e on e.id=i.environment_id and e.project_id=i.project_id
  where i.token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and i.revoked_at is null;
$$;
create function public.create_member_handoff(secret_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Login required' using errcode = '42501'; end if;
  if secret_hash is null or secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash'; end if;
  insert into public.extension_handoffs(token_hash, user_id) values (secret_hash, auth.uid());
end;
$$;
create function public.create_guest_handoff(guest_secret text, secret_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare guest uuid;
begin
  if secret_hash is null or secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash'; end if;
  select session_id into guest from public.get_guest_session(guest_secret);
  if guest is null then raise exception 'Invalid guest session' using errcode = '42501'; end if;
  insert into public.extension_handoffs(token_hash, guest_session_id) values (secret_hash, guest);
end;
$$;
create function public.redeem_extension_handoff(secret text, session_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare handoff public.extension_handoffs;
begin
  if session_secret is null or session_secret !~ '^[0-9a-f]{64}$' then raise exception 'Invalid session secret'; end if;
  select * into handoff from public.extension_handoffs where token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') for update;
  if handoff.id is null or handoff.used_at is not null or handoff.expires_at <= now() then raise exception 'Invalid handoff' using errcode = '42501'; end if;
  if handoff.guest_session_id is not null and not exists (
    select 1 from public.guest_sessions s join public.guest_invites i on i.id = s.invite_id
    where s.id = handoff.guest_session_id and i.revoked_at is null
  ) then raise exception 'Guest access revoked' using errcode = '42501'; end if;
  insert into public.extension_sessions(token_hash, user_id, guest_session_id)
  values (encode(sha256(convert_to(session_secret, 'UTF8')), 'hex'), handoff.user_id, handoff.guest_session_id);
  update public.extension_handoffs set used_at = now() where id = handoff.id;
end;
$$;
create or replace function public.extension_context(secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare connection public.extension_sessions; guest_project uuid; label text; result jsonb;
begin
  select * into connection from public.extension_sessions
  where token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') and revoked_at is null and expires_at > now();
  if connection.id is null then raise exception 'Invalid session' using errcode = '42501'; end if;
  if connection.guest_session_id is not null then
    select s.project_id, s.display_name into guest_project, label from public.guest_sessions s
    join public.guest_invites i on i.id = s.invite_id where s.id = connection.guest_session_id and i.revoked_at is null;
    if guest_project is null then raise exception 'Guest access revoked' using errcode = '42501'; end if;
  else
    select email into label from auth.users where id = connection.user_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'projectId', p.id, 'projectName', p.name, 'name', e.name, 'origin', e.origin) order by p.name, e.name), '[]'::jsonb)
  into result from public.environments e join public.projects p on p.id = e.project_id
  where (guest_project is not null and p.id = guest_project) or (connection.user_id is not null and exists(select 1 from auth.users u where u.id=connection.user_id and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)));
  return jsonb_build_object('kind', case when guest_project is null then 'member' else 'guest' end, 'displayName', label, 'environments', result);
end;
$$;
create function public.revoke_extension_session(secret text) returns void
language sql security definer set search_path = '' as $$
  update public.extension_sessions set revoked_at = coalesce(revoked_at, now())
  where token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex');
$$;
create or replace function public.report_actor(secret text, target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.environments; s public.extension_sessions; actor uuid; guest uuid; allowed boolean; manager boolean;
begin
  select * into e from public.environments where id = target;
  if e.id is null then raise exception 'Environment unavailable' using errcode='42501'; end if;
  if secret is null then
    actor := auth.uid();
    allowed := actor is not null and public.can_read_project(e.project_id);
    manager := public.can_manage_project(e.project_id);
  else
    perform public.extension_context(secret);
    select * into s from public.extension_sessions where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex');
    actor := s.user_id; guest := s.guest_session_id;
    allowed := (actor is not null and exists(select 1 from auth.users u where u.id=actor and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)))
      or exists(select 1 from public.guest_sessions g where g.id=guest and g.project_id=e.project_id);
    manager := actor is not null and allowed;
  end if;
  if not coalesce(allowed,false) then raise exception 'Not authorized' using errcode='42501'; end if;
  return jsonb_build_object('projectId',e.project_id,'userId',actor,'guestId',guest,'manager',coalesce(manager,false),'origin',e.origin);
end;
$$;
create or replace function public.require_reviewer_name(secret text, target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a jsonb;
begin
  a := public.report_actor(secret,target);
  if a->>'guestId' is not null and not exists (
    select 1 from public.guest_sessions g where g.id=(a->>'guestId')::uuid and g.display_name is not null
  ) then raise exception 'REVIEWER_NAME_REQUIRED' using errcode='42501'; end if;
end;
$$;
revoke all on function public.require_reviewer_name(text,uuid) from public,anon,authenticated;

create or replace function public.reviewer_identity(secret text, target uuid, guest_name text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; label text; guest uuid;
begin
  a := public.report_actor(secret,target); guest := (a->>'guestId')::uuid;
  if guest is null then
    select u.email into label from auth.users u where u.id=(a->>'userId')::uuid;
    return jsonb_build_object('displayName',label,'needsName',false);
  end if;
  if guest_name is not null then
    if char_length(trim(guest_name)) not between 1 and 80 then raise exception 'Invalid name' using errcode='22023'; end if;
    -- The first name is retained, including when concurrent requests identify the session.
    update public.guest_sessions set display_name=trim(guest_name) where id=guest and display_name is null;
  end if;
  select g.display_name into label from public.guest_sessions g where g.id=guest;
  return jsonb_build_object('displayName',label,'needsName',label is null);
end;
$$;
revoke all on function public.reviewer_identity(text,uuid,text) from public,anon,authenticated;
grant execute on function public.reviewer_identity(text,uuid,text) to anon,authenticated;

create or replace function public.attachment_operation(secret text, target uuid, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; report public.issues; item public.comment_attachments; actor uuid; guest uuid;
begin
  a := public.report_actor(secret,target); actor := (a->>'userId')::uuid; guest := (a->>'guestId')::uuid;
  if operation is distinct from 'read' then perform public.require_reviewer_name(secret,target); end if;
  select * into report from public.issues where id=(payload->>'issueId')::uuid and environment_id=target for update;
  if report.id is null then raise exception 'Report unavailable' using errcode='42501'; end if;
  select * into item from public.comment_attachments where id=(payload->>'id')::uuid and issue_id=report.id;
  if operation='reserve' then
    if char_length(coalesce(payload->>'name','')) not between 1 and 255
      or char_length(coalesce(payload->>'mime','')) not between 1 and 120
      or (payload->>'size')::integer not between 1 and 2500000 or payload->>'size' is null then
      raise exception 'Invalid attachment' using errcode='22023'; end if;
    if item.id is not null then
      if item.author_id is distinct from actor or item.guest_session_id is distinct from guest
        or item.name is distinct from payload->>'name' or item.mime is distinct from payload->>'mime'
        or item.size is distinct from (payload->>'size')::integer or item.comment_id is not null or item.removing then
        raise exception 'Attachment unavailable' using errcode='42501'; end if;
      return to_jsonb(item);
    end if;
    if (select count(*) from public.comment_attachments where issue_id=report.id and comment_id is null
      and author_id is not distinct from actor and guest_session_id is not distinct from guest) >= 5 then
      raise exception 'Maximum 5 attachments' using errcode='22023'; end if;
    insert into public.comment_attachments(id,issue_id,author_id,guest_session_id,name,mime,size,path)
      values((payload->>'id')::uuid,report.id,actor,guest,payload->>'name',payload->>'mime',(payload->>'size')::integer,
        'attachments/'||report.project_id::text||'/'||report.id::text||'/'||(payload->>'id')::uuid::text) returning * into item;
  elsif operation='read' then
    if item.id is null or item.comment_id is null then raise exception 'Attachment unavailable' using errcode='42501'; end if;
  elsif operation='check' then
    if item.id is null or item.removing or item.author_id is distinct from actor or item.guest_session_id is distinct from guest then
      raise exception 'Attachment unavailable' using errcode='42501'; end if;
  elsif operation in ('remove','discard') then
    if item.id is null then return null; end if;
    if item.comment_id is not null or item.author_id is distinct from actor or item.guest_session_id is distinct from guest then
      raise exception 'Not authorized' using errcode='42501'; end if;
    if operation='remove' then
      update public.comment_attachments set removing=true where id=item.id returning * into item;
    elsif item.removing then
      delete from public.comment_attachments where id=item.id;
    else raise exception 'Removal not started' using errcode='22023'; end if;
  else raise exception 'Unknown operation' using errcode='22023'; end if;
  return to_jsonb(item);
end;
$$;
revoke all on function public.attachment_operation(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.attachment_operation(text,uuid,text,jsonb) to anon,authenticated;

create or replace function public.report_attachment_operation(secret text, target uuid, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; report public.issues; item public.issue_attachments; actor uuid; guest uuid;
begin
  a := public.report_actor(secret,target); actor := (a->>'userId')::uuid; guest := (a->>'guestId')::uuid;
  if operation is distinct from 'read' then perform public.require_reviewer_name(secret,target); end if;
  select * into report from public.issues where id=(payload->>'issueId')::uuid and environment_id=target for update;
  if report.id is null then raise exception 'Report unavailable' using errcode='42501'; end if;
  select * into item from public.issue_attachments where id=(payload->>'id')::uuid and issue_id=report.id;
  if operation='read' then
    if item.id is null or not item.committed or item.removing then raise exception 'Attachment unavailable' using errcode='42501'; end if;
    return to_jsonb(item);
  end if;
  if not coalesce((a->>'manager')::boolean,false) and not coalesce(guest is not null and report.guest_session_id=guest,false) then
    raise exception 'Not authorized' using errcode='42501'; end if;
  if operation='reserve' then
    if char_length(coalesce(payload->>'name','')) not between 1 and 255 or payload->>'size' is null
      or (payload->>'size')::integer not between 1 and 5000000 then raise exception 'Invalid attachment' using errcode='22023'; end if;
    if item.id is not null then
      if item.author_id is distinct from actor or item.guest_session_id is distinct from guest or item.removing
        or item.name is distinct from payload->>'name' or item.size is distinct from (payload->>'size')::integer then
        raise exception 'Attachment unavailable' using errcode='42501'; end if;
      return to_jsonb(item);
    end if;
    if (select count(*) from public.issue_attachments where issue_id=report.id)>=5 then raise exception 'Maximum 5 attachments' using errcode='22023'; end if;
    insert into public.issue_attachments(id,issue_id,author_id,guest_session_id,name,size,path)
      values((payload->>'id')::uuid,report.id,actor,guest,payload->>'name',(payload->>'size')::integer,
        'report-attachments/'||report.project_id::text||'/'||report.id::text||'/'||(payload->>'id')::uuid::text) returning * into item;
  elsif operation in ('commit','remove','discard') then
    if item.id is null then
      if operation in ('remove','discard') then return null; end if;
      raise exception 'Attachment unavailable' using errcode='42501';
    end if;
    if item.author_id is distinct from actor or item.guest_session_id is distinct from guest then raise exception 'Not authorized' using errcode='42501'; end if;
    if operation='commit' then
      if item.removing or not exists(select 1 from storage.objects where bucket_id='report-attachments' and name=item.path
        and metadata->>'mimetype'='application/octet-stream' and metadata->>'size' ~ '^[0-9]+$' and (metadata->>'size')::bigint=item.size) then
        raise exception 'Attachment unavailable' using errcode='42501'; end if;
      update public.issue_attachments set committed=true where id=item.id returning * into item;
    else
      if item.committed then raise exception 'Not authorized' using errcode='42501'; end if;
      if operation='remove' then update public.issue_attachments set removing=true where id=item.id returning * into item;
      elsif item.removing then delete from public.issue_attachments where id=item.id;
      else raise exception 'Removal not started' using errcode='22023'; end if;
    end if;
  else raise exception 'Unknown operation' using errcode='22023'; end if;
  return to_jsonb(item);
end;
$$;
revoke all on function public.report_attachment_operation(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.report_attachment_operation(text,uuid,text,jsonb) to anon,authenticated;

create or replace function public.report_operation(secret text, target uuid, operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare field_name text; anchor jsonb; dimensions jsonb; scroll_position jsonb; a jsonb; report public.issues; result jsonb; actor uuid; guest uuid; manager boolean; editable boolean; report_id uuid; text_body text; comment_uuid uuid; attachment_ids uuid[]; paths jsonb; screenshot_file text; screenshot_files text[];
begin
  a := public.report_actor(secret,target); actor := (a->>'userId')::uuid; guest := (a->>'guestId')::uuid; manager := (a->>'manager')::boolean;
  if operation is null or operation not in ('list','thread') then perform public.require_reviewer_name(secret,target); end if;
  if operation='list' then
    select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc),'[]'::jsonb) into result from (
      select to_jsonb(i) || jsonb_build_object('authorName',coalesce(g.display_name,u.email,'Utente'),
        'authorKey',case when i.author_id is not null then 'user:'||i.author_id::text else 'guest:'||i.guest_session_id::text end,
        'updatedByName',coalesce(ug.display_name,uu.email),
        'updatedByKey',case when i.updated_by is not null then 'user:'||i.updated_by::text when i.updated_guest_session_id is not null then 'guest:'||i.updated_guest_session_id::text end,
        'canEdit',manager or (actor is not null and i.author_id=actor), 'canChangeStatus',actor is not null or guest is not null,
        'commentCount',(select count(*) from public.comments c where c.issue_id=i.id)) row_data
      from public.issues i left join public.guest_sessions g on g.id=i.guest_session_id left join auth.users u on u.id=i.author_id
      left join public.guest_sessions ug on ug.id=i.updated_guest_session_id left join auth.users uu on uu.id=i.updated_by
      where i.environment_id=target and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
    ) rows;
    return result;
  end if;
  if operation='create' then
    if payload ? 'priority' and (payload->>'priority' is null or payload->>'priority' not in ('low','medium','high')) then raise exception 'Invalid priority' using errcode='22023'; end if;
    text_body := trim(payload->>'body');
    if text_body is null or char_length(text_body) not between 1 and 10000 or jsonb_typeof(payload->'context') <> 'object'
      or jsonb_typeof(payload->'context'->'anchor') is distinct from 'object' or coalesce(payload->'context'->'anchor'->>'kind','') not in ('pin','element','page')
      or ((payload->'context'->'anchor'->>'kind') <> 'page' and (jsonb_typeof(payload->'context'->'viewport') is distinct from 'object' or jsonb_typeof(payload->'context'->'scroll') is distinct from 'object'))
      or (payload->'context' ? 'viewport' and jsonb_typeof(payload->'context'->'viewport') is distinct from 'object')
      or (payload->'context' ? 'scroll' and jsonb_typeof(payload->'context'->'scroll') is distinct from 'object')
      or char_length(coalesce(payload->'context'->>'url','')) not between 1 and 8192 or char_length(coalesce(payload->'context'->>'pagePath','')) > 8192
      or (payload->'context'->>'origin') is distinct from (a->>'origin') or coalesce(payload->'context'->>'pagePath','')='' then
      raise exception 'Invalid report' using errcode='22023'; end if;
    anchor := payload->'context'->'anchor'; dimensions := payload->'context'->'viewport'; scroll_position := payload->'context'->'scroll';
    if left(payload->'context'->>'url',length(a->>'origin')+1) is distinct from (a->>'origin')||'/' then raise exception 'Invalid URL' using errcode='22023'; end if;
    if anchor->>'kind'='element' then
      if char_length(coalesce(anchor->>'selector','')) not between 1 and 4096 then raise exception 'Invalid selector' using errcode='22023'; end if;
      foreach field_name in array array['offsetX','offsetY'] loop
        if jsonb_typeof(anchor->field_name) is distinct from 'number' then raise exception 'Invalid offset' using errcode='22023'; end if;
        if (anchor->>field_name)::numeric not between 0 and 1 then raise exception 'Invalid offset' using errcode='22023'; end if;
      end loop;
    elsif anchor->>'kind'='pin' then
      foreach field_name in array array['documentX','documentY'] loop
        if jsonb_typeof(anchor->field_name) is distinct from 'number' then raise exception 'Invalid pin' using errcode='22023'; end if;
        if (anchor->>field_name)::numeric not between 0 and 10000000 then raise exception 'Invalid pin' using errcode='22023'; end if;
      end loop;
    end if;
    if dimensions is not null then
      foreach field_name in array array['width','height','devicePixelRatio'] loop
        if jsonb_typeof(dimensions->field_name) is distinct from 'number' then raise exception 'Invalid viewport' using errcode='22023'; end if;
        if (dimensions->>field_name)::numeric <= 0 or (dimensions->>field_name)::numeric > 10000000 then raise exception 'Invalid viewport' using errcode='22023'; end if;
      end loop;
    end if;
    if scroll_position is not null then
      foreach field_name in array array['x','y'] loop
        if jsonb_typeof(scroll_position->field_name) is distinct from 'number' then raise exception 'Invalid scroll' using errcode='22023'; end if;
        if (scroll_position->>field_name)::numeric not between 0 and 10000000 then raise exception 'Invalid scroll' using errcode='22023'; end if;
      end loop;
    end if;
    report_id := coalesce((payload->>'id')::uuid,gen_random_uuid());
    insert into public.issues(id,project_id,environment_id,page_path,body,author_id,guest_session_id,context,priority)
    values (report_id,(a->>'projectId')::uuid,target,payload->'context'->>'pagePath',text_body,actor,guest,payload->'context',coalesce(payload->>'priority','medium')) on conflict(id) do nothing returning * into report;
    if report.id is null then
      select * into report from public.issues where id=report_id;
      if report.environment_id is distinct from target or report.author_id is distinct from actor or report.guest_session_id is distinct from guest or report.body is distinct from text_body or report.context is distinct from payload->'context' or report.priority is distinct from coalesce(payload->>'priority','medium') then
        raise exception 'Report ID already used' using errcode='42501';
      end if;
    end if;
    return to_jsonb(report);
  end if;
  report_id := (payload->>'id')::uuid;
  select * into report from public.issues where id=report_id and environment_id=target for update;
  if report.id is null then raise exception 'Report unavailable' using errcode='42501'; end if;
  editable := manager or (actor is not null and report.author_id=actor);
  if operation='thread' then
    select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('authorName',coalesce(g.display_name,u.email,'Utente'),'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size) order by f.created_at,f.id) from public.comment_attachments f where f.comment_id=c.id),'[]'::jsonb)) order by c.created_at),'[]'::jsonb)
    into result from public.comments c left join public.guest_sessions g on g.id=c.guest_session_id left join auth.users u on u.id=c.author_id where c.issue_id=report.id;
    return jsonb_build_object('issue',to_jsonb(report)||jsonb_build_object('attachments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size) order by f.created_at,f.id)
      from public.issue_attachments f where f.issue_id=report.id and f.committed and not f.removing),'[]'::jsonb)),'comments',result);
  elsif operation='reply' then
    text_body := trim(payload->>'body');
    if text_body is null or char_length(text_body) not between 1 and 10000 then raise exception 'Invalid comment' using errcode='22023'; end if;
    if payload ? 'attachments' and jsonb_typeof(payload->'attachments') is distinct from 'array' then
      raise exception 'Invalid attachments' using errcode='22023'; end if;
    select coalesce(array_agg(value::uuid),array[]::uuid[]) into attachment_ids from jsonb_array_elements_text(coalesce(payload->'attachments','[]'::jsonb));
    if cardinality(attachment_ids)>5 or cardinality(attachment_ids)<>(select count(distinct x) from unnest(attachment_ids) x) then
      raise exception 'Invalid attachments' using errcode='22023'; end if;
    comment_uuid := coalesce((payload->>'replyId')::uuid,gen_random_uuid());
    if exists(select 1 from public.comments where id=comment_uuid) then
      if not exists(select 1 from public.comments where id=comment_uuid and issue_id=report.id and body=text_body
        and author_id is not distinct from actor and guest_session_id is not distinct from guest)
        or (select count(*) from public.comment_attachments where comment_id=comment_uuid and id=any(attachment_ids))<>cardinality(attachment_ids)
        or (select count(*) from public.comment_attachments where comment_id=comment_uuid)<>cardinality(attachment_ids) then
        raise exception 'Reply ID already used' using errcode='42501'; end if;
      return to_jsonb(report);
    end if;
    if (select count(*) from public.comment_attachments f where f.id=any(attachment_ids) and f.issue_id=report.id
      and f.comment_id is null and not f.removing and f.author_id is not distinct from actor and f.guest_session_id is not distinct from guest
      and exists(select 1 from storage.objects o where o.bucket_id='attachments' and o.name=f.path
        and (o.metadata->>'size')::bigint=f.size))<>cardinality(attachment_ids) then
      raise exception 'Attachments unavailable' using errcode='42501'; end if;
    insert into public.comments(id,project_id,issue_id,body,author_id,guest_session_id) values(comment_uuid,report.project_id,report.id,text_body,actor,guest);
    update public.comment_attachments set comment_id=comment_uuid where id=any(attachment_ids);
  elsif operation='status' then
    if actor is null and guest is null then raise exception 'Not authorized' using errcode='42501'; end if;
    if payload->>'status' not in ('open','in_progress','validation','resolved') or payload->>'status' is null then raise exception 'Invalid status' using errcode='22023'; end if;
    update public.issues set status=payload->>'status', updated_at=clock_timestamp(), updated_by=actor, updated_guest_session_id=guest where id=report.id and status is distinct from payload->>'status';
  elsif operation='priority' then
    if actor is null and guest is null then raise exception 'Not authorized' using errcode='42501'; end if;
    if payload->>'priority' is null or payload->>'priority' not in ('low','medium','high') then raise exception 'Invalid priority' using errcode='22023'; end if;
    update public.issues set priority=payload->>'priority' where id=report.id;
  elsif operation='edit' then
    if not coalesce(editable,false) then raise exception 'Not authorized' using errcode='42501'; end if;
    text_body := trim(payload->>'body');
    if text_body is null or char_length(text_body) not between 1 and 10000 then raise exception 'Invalid report' using errcode='22023'; end if;
    update public.issues set body=text_body where id=report.id;
  elsif operation in ('screenshot','screenshot_prepare') then
    if not coalesce(editable,false) and not coalesce(guest is not null and report.guest_session_id=guest,false) then raise exception 'Not authorized' using errcode='42501'; end if;
    screenshot_file := case when payload ? 'screenshotId' then report.project_id::text||'/'||report.id::text||'/'||(payload->>'screenshotId')::uuid::text||'.jpg'
      else report.project_id::text||'/'||report.id::text||'.jpg' end;
    if screenshot_file is null then raise exception 'Invalid screenshot' using errcode='22023'; end if;
    screenshot_files := report.screenshot_paths;
    if report.screenshot_path is not null and not report.screenshot_path=any(screenshot_files) then screenshot_files := array_prepend(report.screenshot_path,screenshot_files); end if;
    if not screenshot_file=any(screenshot_files) and cardinality(screenshot_files)>=5 then raise exception 'Maximum 5 screenshots' using errcode='22023'; end if;
    if operation='screenshot_prepare' then return to_jsonb(report); end if;
    if payload ? 'screenshotId' and not exists(select 1 from storage.objects where bucket_id='screenshots' and name=screenshot_file
      and metadata->>'mimetype'='image/jpeg' and metadata->>'size' ~ '^[0-9]+$' and (metadata->>'size')::bigint between 1 and 2500000) then
      raise exception 'Screenshot unavailable' using errcode='42501'; end if;
    if not screenshot_file=any(screenshot_files) then screenshot_files := array_append(screenshot_files,screenshot_file); end if;
    update public.issues set screenshot_path=screenshot_files[1],screenshot_paths=screenshot_files where id=report.id;
  elsif operation='delete' then
    if not coalesce(editable,false) then raise exception 'Not authorized' using errcode='42501'; end if;
    select coalesce(jsonb_agg(path),'[]'::jsonb) into paths from (
      select path from public.comment_attachments where issue_id=report.id
      union all select path from public.issue_attachments where issue_id=report.id
    ) files;
    delete from public.issues where id=report.id;
    return to_jsonb(report)||jsonb_build_object('attachment_paths',paths);
  else raise exception 'Unknown operation' using errcode='22023'; end if;
  if operation in ('priority','edit','screenshot') then
    update public.issues set updated_at=clock_timestamp(),updated_by=actor,updated_guest_session_id=guest where id=report.id
      and (operation='screenshot' or body is distinct from report.body or status is distinct from report.status or priority is distinct from report.priority);
    select * into report from public.issues where id=report.id;
  end if;
  if operation='status' then select * into report from public.issues where id=report.id; end if;
  return to_jsonb(report);
end;
$$;
create or replace function public.list_project_participants(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.can_read_project(target) then raise exception 'Not authorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(row_data order by row_data->>'name',row_data->>'key'),'[]'::jsonb) into result from (
    select jsonb_build_object('key','user:'||u.id::text,'kind','developer','name',u.email) row_data
    from auth.users u where u.id in (
      select created_by from public.projects where id=target
      union select author_id from public.issues where project_id=target
      union select updated_by from public.issues where project_id=target
      union select author_id from public.comments where project_id=target
    )
    union all
    select jsonb_build_object('key','guest:'||g.id::text,'kind','guest','name',g.display_name) from public.guest_sessions g where g.project_id=target and g.display_name is not null
  ) participants;
  return result;
end;
$$;
revoke all on function public.list_project_participants(uuid) from public,anon,authenticated;
grant execute on function public.list_project_participants(uuid) to authenticated;
create or replace function public.platform_delete_resource(target uuid, kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare project uuid; paths jsonb;
begin
  if not public.can_manage_project(target) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if kind='project' then
    select id into project from public.projects where id=target for update;
  elsif kind='environment' then
    select project_id into project from public.environments where id=target for update;
  else raise exception 'Invalid resource' using errcode='22023'; end if;
  if project is null then raise exception 'Resource unavailable' using errcode='22023'; end if;
  select coalesce(jsonb_agg(distinct shot.path),'[]'::jsonb) into paths from public.issues i
    cross join lateral unnest(i.screenshot_paths || array[i.screenshot_path]) as shot(path)
    where i.project_id=project and (kind='project' or i.environment_id=target) and shot.path is not null;
  paths := paths || coalesce((select jsonb_agg(f.path) from public.comment_attachments f join public.issues i on i.id=f.issue_id where i.project_id=project and (kind='project' or i.environment_id=target)),'[]'::jsonb);
  paths := paths || coalesce((select jsonb_agg(f.path) from public.issue_attachments f join public.issues i on i.id=f.issue_id where i.project_id=project and (kind='project' or i.environment_id=target)),'[]'::jsonb);
  -- Remove issues first because the environment FK does not cascade.
  delete from public.issues where project_id=project and (kind='project' or environment_id=target);
  if kind='project' then delete from public.projects where id=target;
  else delete from public.environments where id=target; end if;
  return paths;
end;
$$;
create function public.create_environment_review_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare secret text; invitation uuid; creator uuid;
begin
  select created_by into creator from public.projects where id=new.project_id;
  secret := encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.guest_invites(project_id,environment_id,token_hash,created_by)
    values(new.project_id,new.id,encode(sha256(convert_to(secret,'UTF8')),'hex'),coalesce(auth.uid(),creator)) returning id into invitation;
  insert into public.environment_review_links(environment_id,invite_id,token) values(new.id,invitation,secret);
  return new;
end;
$$;
create function public.regenerate_environment_review_link(environment uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare target public.environments; existing public.environment_review_links; secret text; invitation uuid;
begin
  select * into target from public.environments where id=environment for update;
  if target.id is null or not public.can_manage_project(target.project_id) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into existing from public.environment_review_links where environment_id=environment;
  update public.guest_invites set revoked_at=now() where id=existing.invite_id;
  secret := encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.guest_invites(project_id,environment_id,token_hash,created_by)
    values(target.project_id,target.id,encode(sha256(convert_to(secret,'UTF8')),'hex'),auth.uid()) returning id into invitation;
  insert into public.environment_review_links(environment_id,invite_id,token) values(target.id,invitation,secret)
    on conflict(environment_id) do update set invite_id=excluded.invite_id,token=excluded.token;
  return secret;
end;
$$;
create trigger environment_review_link_created after insert on public.environments
for each row execute function public.create_environment_review_link();

alter table public.projects enable row level security;
revoke all on public.projects from anon,authenticated;
alter table public.environments enable row level security;
revoke all on public.environments from anon,authenticated;
alter table public.issues enable row level security;
revoke all on public.issues from anon,authenticated;
alter table public.comments enable row level security;
revoke all on public.comments from anon,authenticated;
alter table public.guest_invites enable row level security;
revoke all on public.guest_invites from anon,authenticated;
alter table public.guest_sessions enable row level security;
revoke all on public.guest_sessions from anon,authenticated;
alter table public.extension_handoffs enable row level security;
revoke all on public.extension_handoffs from anon,authenticated;
alter table public.extension_sessions enable row level security;
revoke all on public.extension_sessions from anon,authenticated;
alter table public.environment_review_links enable row level security;
revoke all on public.environment_review_links from anon,authenticated;

grant select,insert on public.projects to authenticated;
grant update(name) on public.projects to authenticated;
grant select,insert on public.environments to authenticated;
grant update(name,origin) on public.environments to authenticated;
grant select on public.issues,public.comments,public.environment_review_links to authenticated;

create policy project_read on public.projects for select to authenticated using(public.can_read_project(id));
create policy project_create on public.projects for insert to authenticated with check(created_by=auth.uid() and public.can_manage_project(id));
create policy project_rename on public.projects for update to authenticated using(public.can_manage_project(id)) with check(public.can_manage_project(id));
create policy environment_read on public.environments for select to authenticated using(public.can_read_project(project_id));
create policy environment_create on public.environments for insert to authenticated with check(public.can_manage_project(project_id));
create policy environment_edit on public.environments for update to authenticated using(public.can_manage_project(project_id)) with check(public.can_manage_project(project_id));
create policy issue_read on public.issues for select to authenticated using(public.can_read_project(project_id));
create policy comment_read on public.comments for select to authenticated using(public.can_read_project(project_id));
create policy environment_review_link_read on public.environment_review_links for select to authenticated
using(exists(select 1 from public.environments e where e.id=environment_id and public.can_read_project(e.project_id)));

revoke all on function public.can_read_project(uuid) from public,anon,authenticated;
grant execute on function public.can_read_project(uuid) to authenticated;
revoke all on function public.can_manage_project(uuid) from public,anon,authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
revoke all on function public.start_guest_session(text,text,text) from public,anon,authenticated;
grant execute on function public.start_guest_session(text,text,text) to anon,authenticated;
revoke all on function public.get_guest_session(text) from public,anon,authenticated;
grant execute on function public.get_guest_session(text) to anon,authenticated;
revoke all on function public.preview_guest_review(text) from public,anon,authenticated;
grant execute on function public.preview_guest_review(text) to anon,authenticated;
revoke all on function public.create_member_handoff(text) from public,anon,authenticated;
grant execute on function public.create_member_handoff(text) to authenticated;
revoke all on function public.create_guest_handoff(text,text) from public,anon,authenticated;
grant execute on function public.create_guest_handoff(text,text) to anon,authenticated;
revoke all on function public.redeem_extension_handoff(text,text) from public,anon,authenticated;
grant execute on function public.redeem_extension_handoff(text,text) to anon,authenticated;
revoke all on function public.extension_context(text) from public,anon,authenticated;
grant execute on function public.extension_context(text) to anon,authenticated;
revoke all on function public.revoke_extension_session(text) from public,anon,authenticated;
grant execute on function public.revoke_extension_session(text) to anon,authenticated;
revoke all on function public.report_actor(text,uuid) from public,anon,authenticated;
revoke all on function public.report_operation(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.report_operation(text,uuid,text,jsonb) to anon,authenticated;
revoke all on function public.platform_delete_resource(uuid,text) from public,anon,authenticated;
grant execute on function public.platform_delete_resource(uuid,text) to authenticated;
revoke all on function public.create_environment_review_link() from public,anon,authenticated;
revoke all on function public.regenerate_environment_review_link(uuid) from public,anon,authenticated;
grant execute on function public.regenerate_environment_review_link(uuid) to authenticated;

create or replace function public.create_project_with_production(project_name text, site_origin text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare project uuid;
begin
  if not public.can_manage_project(null) then raise exception 'Not authorized' using errcode='42501'; end if;
  if project_name is null or char_length(trim(project_name)) not between 1 and 120 then raise exception 'Invalid name' using errcode='22023'; end if;
  if site_origin is null or site_origin !~ '^https?://[^/?#[:space:]@]+$' then raise exception 'Invalid origin' using errcode='22023'; end if;
  insert into public.projects(name,created_by) values(trim(project_name),auth.uid()) returning id into project;
  -- The environment trigger creates its guest invitation and readable link.
  insert into public.environments(project_id,name,origin) values(project,'Produzione',site_origin);
  return project;
end;
$$;
revoke all on function public.create_project_with_production(text,text) from public,anon,authenticated;
grant execute on function public.create_project_with_production(text,text) to authenticated;

create table public.environment_widgets (
  environment_id uuid primary key references public.environments(id) on delete cascade,
  public_key uuid not null unique default gen_random_uuid(),
  enabled boolean not null default false
);
create table public.widget_sessions (
  token_hash text primary key,
  environment_id uuid not null references public.environments(id) on delete cascade,
  guest_session_id uuid not null references public.guest_sessions(id) on delete cascade,
  origin text not null,
  expires_at timestamptz not null default now()+interval '1 day'
);
alter table public.environment_widgets enable row level security;
alter table public.widget_sessions enable row level security;
revoke all on public.environment_widgets,public.widget_sessions from anon,authenticated;
grant select on public.environment_widgets to authenticated;
grant update(enabled) on public.environment_widgets to authenticated;
create policy widget_read on public.environment_widgets for select to authenticated using(public.can_read_project(environment_id));
create policy widget_toggle on public.environment_widgets for update to authenticated using(public.can_manage_project(environment_id)) with check(public.can_manage_project(environment_id));
create function public.add_environment_widget() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.environment_widgets(environment_id) values(new.id); return new; end;
$$;
revoke all on function public.add_environment_widget() from public;
create trigger environment_widget_created after insert on public.environments for each row execute function public.add_environment_widget();
insert into public.environment_widgets(environment_id) select id from public.environments;

create function public.widget_config(key uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',w.enabled,'environment',jsonb_build_object('id',e.id,'projectId',p.id,'projectName',p.name,'name',e.name,'origin',e.origin))
 from public.environment_widgets w join public.environments e on e.id=w.environment_id join public.projects p on p.id=e.project_id where w.public_key=key;
$$;
create function public.widget_authorize(secret text, request_origin text) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
 select s.environment_id into result from public.widget_sessions s join public.environment_widgets w on w.environment_id=s.environment_id
 join public.environments e on e.id=s.environment_id join public.guest_sessions g on g.id=s.guest_session_id join public.guest_invites i on i.id=g.invite_id
 where s.token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and s.expires_at>now() and w.enabled and i.revoked_at is null and s.origin=request_origin and (s.origin=e.origin or s.origin ~ '^https?://localhost(:[0-9]{1,5})?$');
 if result is null then raise exception 'Widget disabled or session unavailable' using errcode='42501'; end if;
 return result;
end;
$$;
create function public.start_widget_session(key uuid, request_origin text, guest_name text, session_secret text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.environments; guest uuid; invitation uuid;
begin
 select e.* into target from public.environment_widgets w join public.environments e on e.id=w.environment_id where w.public_key=key and w.enabled and (e.origin=request_origin or request_origin ~ '^https?://localhost(:[0-9]{1,5})?$') for share of w;
 if target.id is null then raise exception 'Widget unavailable' using errcode='42501'; end if;
 if (guest_name is not null and char_length(trim(guest_name)) not between 1 and 80) or session_secret is null or session_secret !~ '^[0-9a-f]{64}$' then raise exception 'Invalid details' using errcode='22023'; end if;
 select invite_id into invitation from public.environment_review_links where environment_id=target.id;
 insert into public.guest_sessions(project_id,invite_id,token_hash,display_name) values(target.project_id,invitation,encode(sha256(convert_to(session_secret,'UTF8')),'hex'),trim(guest_name)) returning id into guest;
 insert into public.widget_sessions(token_hash,environment_id,guest_session_id,origin) values(encode(sha256(convert_to(session_secret,'UTF8')),'hex'),target.id,guest,request_origin);
end;
$$;
revoke all on function public.widget_config(uuid),public.widget_authorize(text,text),public.start_widget_session(uuid,text,text,text) from public;
grant execute on function public.widget_config(uuid),public.widget_authorize(text,text),public.start_widget_session(uuid,text,text,text) to anon,authenticated;

create or replace function public.report_actor(secret text, target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.environments; s public.extension_sessions; actor uuid; guest uuid; allowed boolean; manager boolean;
begin
  select * into e from public.environments where id = target;
  if e.id is null then raise exception 'Environment unavailable' using errcode='42501'; end if;
  if secret is null then
    actor := auth.uid();
    allowed := actor is not null and public.can_read_project(e.project_id);
    manager := public.can_manage_project(e.project_id);
  elsif exists(select 1 from public.widget_sessions where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex')) then
    select origin into e.origin from public.widget_sessions where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and environment_id=target;
    perform public.widget_authorize(secret,e.origin);
    select guest_session_id into guest from public.widget_sessions where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and environment_id=target;
    allowed := guest is not null;
    manager := allowed;
  else
    perform public.extension_context(secret);
    select * into s from public.extension_sessions where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex');
    actor := s.user_id; guest := s.guest_session_id;
    allowed := (actor is not null and exists(select 1 from auth.users u where u.id=actor and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)))
      or exists(select 1 from public.guest_sessions g where g.id=guest and g.project_id=e.project_id);
    manager := actor is not null and allowed;
  end if;
  if not coalesce(allowed,false) then raise exception 'Not authorized' using errcode='42501'; end if;
  return jsonb_build_object('projectId',e.project_id,'userId',actor,'guestId',guest,'manager',coalesce(manager,false),'origin',e.origin);
end;
$$;


create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  kind text not null default 'status_changed' check(kind in ('created','status_changed','reply')),
  comment_id uuid references public.comments(id) on delete cascade,
  previous_status text check(previous_status in ('open','in_progress','validation','resolved')),
  status text not null check(status in ('open','in_progress','validation','resolved')),
  actor_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  check(num_nonnulls(user_id,guest_session_id)=1)
);
create index if not exists notifications_user on public.notifications(user_id,created_at desc);
create index if not exists notifications_guest on public.notifications(guest_session_id,created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;

create or replace function public.notify_issue_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare label text; previous text; actor uuid; guest uuid; event_kind text;
begin
  if tg_op='INSERT' then
    event_kind:='created'; previous:=null; actor:=new.author_id; guest:=new.guest_session_id;
  else
    if new.status is not distinct from old.status then return new; end if;
    event_kind:='status_changed'; previous:=old.status; actor:=new.updated_by; guest:=new.updated_guest_session_id;
  end if;
  select coalesce(g.display_name,u.email,'Utente') into label
    from public.issues i left join auth.users u on u.id=actor
    left join public.guest_sessions g on g.id=guest where i.id=new.id;
  insert into public.notifications(issue_id,user_id,previous_status,status,actor_name,kind)
    select new.id,u.id,previous,new.status,label,event_kind from auth.users u
    where not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false);
  insert into public.notifications(issue_id,guest_session_id,previous_status,status,actor_name,kind)
    select new.id,g.id,previous,new.status,label,event_kind from public.guest_sessions g
    join public.guest_invites v on v.id=g.invite_id and v.revoked_at is null
    where g.project_id=new.project_id;
  return new;
end;
$$;
revoke all on function public.notify_issue_status() from public,anon,authenticated;
drop trigger if exists issue_status_notification on public.issues;
create trigger issue_status_notification after insert or update of status on public.issues
for each row execute function public.notify_issue_status();

create or replace function public.notify_issue_reply() returns trigger
language plpgsql security definer set search_path='' as $$
declare report public.issues; label text;
begin
  select * into report from public.issues where id=new.issue_id and project_id=new.project_id;
  select coalesce(g.display_name,u.email,'Utente') into label
    from public.comments c left join auth.users u on u.id=new.author_id
    left join public.guest_sessions g on g.id=new.guest_session_id where c.id=new.id;
  insert into public.notifications(issue_id,user_id,kind,comment_id,status,actor_name)
    select report.id,u.id,'reply',new.id,report.status,label from auth.users u
    where not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false);
  insert into public.notifications(issue_id,guest_session_id,kind,comment_id,status,actor_name)
    select report.id,g.id,'reply',new.id,report.status,label from public.guest_sessions g
    join public.guest_invites v on v.id=g.invite_id and v.revoked_at is null
    where g.project_id=report.project_id;
  return new;
end;
$$;
revoke all on function public.notify_issue_reply() from public,anon,authenticated;
drop trigger if exists issue_reply_notification on public.comments;
create trigger issue_reply_notification after insert on public.comments
for each row execute function public.notify_issue_reply();

create or replace function public.notification_operation(secret text, target uuid, operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; actor uuid; guest uuid; result jsonb;
begin
  if target is null then
    if secret is not null or not public.can_read_project(null) then raise exception 'Not authorized' using errcode='42501'; end if;
    actor:=auth.uid();
  else
    a:=public.report_actor(secret,target);
    actor:=(a->>'userId')::uuid; guest:=(a->>'guestId')::uuid;
  end if;
  if operation not in ('notifications','notification_read','notifications_read') or operation is null then
    raise exception 'Invalid operation' using errcode='22023';
  end if;
  if operation='notification_read' and not (payload ? 'id') then
    raise exception 'Notification required' using errcode='22023';
  end if;
  if operation in ('notification_read','notifications_read') then
    update public.notifications n set read_at=coalesce(n.read_at,clock_timestamp())
    from public.issues i where i.id=n.issue_id
      and ((actor is not null and n.user_id=actor) or (guest is not null and n.guest_session_id=guest))
      and (target is null or i.environment_id=target)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
      and (operation='notifications_read' or n.id=(payload->>'id')::uuid);
    if operation='notification_read' and not found then raise exception 'Notification unavailable' using errcode='42501'; end if;
  end if;
  select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc,row_data->>'id'),'[]'::jsonb) into result from (
    select jsonb_build_object('id',n.id,'issue_id',i.id,'project_id',i.project_id,'environment_id',i.environment_id,
      'project_name',p.name,'environment_name',e.name,'page_path',i.page_path,'body',i.body,
      'kind',n.kind,'comment_id',n.comment_id,'reply_body',c.body,'previous_status',n.previous_status,'status',n.status,'actor_name',n.actor_name,'created_at',n.created_at,'read_at',n.read_at) row_data
    from public.notifications n join public.issues i on i.id=n.issue_id
    left join public.comments c on c.id=n.comment_id and c.issue_id=i.id
    join public.projects p on p.id=i.project_id join public.environments e on e.id=i.environment_id
    where ((actor is not null and n.user_id=actor) or (guest is not null and n.guest_session_id=guest))
      and (target is null or i.environment_id=target)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
  ) rows;
  return result;
end;
$$;
revoke all on function public.notification_operation(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.notification_operation(text,uuid,text,jsonb) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('screenshots','screenshots',false,2621440,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No Storage client policies are required: the backend checks report access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('attachments','attachments',false,2500000,null)
on conflict(id) do update set public=false,file_size_limit=2500000,allowed_mime_types=null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('report-attachments','report-attachments',false,5000000,array['application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;


commit;

-- Incremental, non-destructive pagination API. Apply before deploying the clients.
create index if not exists issues_environment_status_created_idx on public.issues(environment_id,status,created_at,id);
-- Match the UI's case/accent insensitive numeric ordering without extra extensions.
create or replace function public.report_text_sort(value text) returns text
language sql immutable strict set search_path = '' as $$
  select string_agg(case when part[1] ~ '^[0-9]+$'
    then chr(1)||lpad(length(ltrim(part[1],'0'))::text,8,'0')||ltrim(part[1],'0')
    else translate(lower(part[1]),'àáâäãåèéêëìíîïòóôöõùúûüçñ','aaaaaaeeeeiiiiooooouuuucn') end,'' order by ordinal)
  from regexp_matches(value,'[0-9]+|[^0-9]+','g') with ordinality as pieces(part,ordinal);
$$;
revoke all on function public.report_text_sort(text) from public,anon,authenticated;
create or replace function public.report_page(secret text, target uuid, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a jsonb; project_scope boolean; page_size integer; page_offset integer; sort_field text; sort_direction text; result jsonb;
begin
  a := public.report_actor(secret,target);
  project_scope := coalesce((payload->>'projectScope')::boolean,false);
  if project_scope and (a->>'userId' is null or not coalesce((a->>'manager')::boolean,false)) then raise exception 'Not authorized' using errcode='42501'; end if;
  page_size := coalesce((payload->>'limit')::integer,20);
  page_offset := coalesce((payload->>'offset')::integer,0);
  sort_field := coalesce(payload->'sort'->>'field','status');
  sort_direction := coalesce(payload->'sort'->>'direction','asc');
  if page_size not between 1 and 100 or page_offset < 0 or sort_direction not in ('asc','desc')
    or sort_field not in ('status','priority','created_at','updated_at','body','environment','authorName') then
    raise exception 'Invalid pagination' using errcode='22023'; end if;
  with scoped as materialized (
    select i.*, e.name environment_name, coalesce(g.display_name,u.email,'Utente') author_name,
      case when i.author_id is not null then 'user:'||i.author_id::text else 'guest:'||i.guest_session_id::text end author_key,
      coalesce(ug.display_name,uu.email) updated_name,
      case when i.updated_by is not null then 'user:'||i.updated_by::text when i.updated_guest_session_id is not null then 'guest:'||i.updated_guest_session_id::text end updated_key
    from public.issues i join public.environments e on e.id=i.environment_id
      left join public.guest_sessions g on g.id=i.guest_session_id left join auth.users u on u.id=i.author_id
      left join public.guest_sessions ug on ug.id=i.updated_guest_session_id left join auth.users uu on uu.id=i.updated_by
    where (case when project_scope then i.project_id=(a->>'projectId')::uuid else i.environment_id=target end)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
      and (coalesce(jsonb_array_length(payload->'environments'),0)=0 or payload->'environments' ? i.environment_id::text)
  ), filtered as materialized (
    select *, case status when 'open' then 0 when 'in_progress' then 1 when 'validation' then 2 else 3 end status_rank,
      case priority when 'high' then 0 when 'medium' then 1 else 2 end priority_rank
    from scoped i where
      (not(payload ? 'id') or i.id=(payload->>'id')::uuid)
      and (coalesce(jsonb_array_length(payload->'statuses'),0)=0 or payload->'statuses' ? i.status)
      and (coalesce(jsonb_array_length(payload->'priorities'),0)=0 or payload->'priorities' ? i.priority)
      and (coalesce(jsonb_array_length(payload->'pages'),0)=0 or payload->'pages' ? i.page_path)
      and (coalesce(jsonb_array_length(payload->'users'),0)=0 or payload->'users' ? i.author_key or payload->'users' ? i.updated_key)
      and (coalesce(payload->>'search','')='' or position(lower(payload->>'search') in lower(i.body||' '||i.page_path||case when project_scope then '' else ' '||i.author_name end))>0)
  ), ranked as (
    select *, row_number() over(order by
      case when sort_field='status' then status_rank * case sort_direction when 'desc' then -1 else 1 end end,
      case when sort_field='priority' then priority_rank * case sort_direction when 'desc' then -1 else 1 end end,
      case when sort_field='created_at' and sort_direction='asc' then created_at end asc,
      case when sort_field='created_at' and sort_direction='desc' then created_at end desc,
      case when sort_field='updated_at' and sort_direction='asc' then updated_at end asc nulls last,
      case when sort_field='updated_at' and sort_direction='desc' then updated_at end desc nulls last,
      case when sort_direction='asc' then case sort_field when 'body' then public.report_text_sort(body) when 'authorName' then public.report_text_sort(author_name) when 'environment' then public.report_text_sort(environment_name) end end asc,
      case when sort_direction='desc' then case sort_field when 'body' then public.report_text_sort(body) when 'authorName' then public.report_text_sort(author_name) when 'environment' then public.report_text_sort(environment_name) end end desc,
      case when sort_field='environment' and sort_direction='asc' then public.report_text_sort(page_path) end asc,
      case when sort_field='environment' and sort_direction='desc' then public.report_text_sort(page_path) end desc,
      case when sort_field='status' then priority_rank end, created_at asc,id asc) position
    from filtered
  ), batch as (
    select * from ranked order by position limit page_size offset page_offset
  )
  select jsonb_build_object('total',(select count(*) from filtered),
    'projectTotal',(select count(*) from public.issues i where case when project_scope then i.project_id=(a->>'projectId')::uuid else i.environment_id=target end),
    'pages',(select coalesce(jsonb_agg(p.page_path order by p.page_path),'[]'::jsonb) from (select distinct page_path from scoped) p),
    'reports',case when coalesce((payload->>'selectionOnly')::boolean,false) then
      coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'environment_id',f.environment_id,
        'canEdit',coalesce((a->>'manager')::boolean,false) or coalesce(f.author_id=(a->>'userId')::uuid,false),
        'canChangeStatus',a->>'userId' is not null or a->>'guestId' is not null)) from filtered f),'[]'::jsonb)
      else coalesce((select jsonb_agg((to_jsonb(b)-array['environment_name','author_name','author_key','updated_name','updated_key','status_rank','priority_rank','position']) ||
      jsonb_build_object('authorName',b.author_name,'authorKey',b.author_key,'updatedByName',b.updated_name,'updatedByKey',b.updated_key,
        'canEdit',coalesce((a->>'manager')::boolean,false) or coalesce(b.author_id=(a->>'userId')::uuid,false),
        'canChangeStatus',a->>'userId' is not null or a->>'guestId' is not null,
        'commentCount',(select count(*) from public.comments c where c.issue_id=b.id)) order by b.position) from batch b),'[]'::jsonb) end) into result;
  return result;
end;
$$;
revoke all on function public.report_page(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.report_page(text,uuid,jsonb) to anon,authenticated;

-- Pin previews are lightweight metadata, independent of paginated full reports.
create or replace function public.report_pins(secret text, target uuid, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.report_actor(secret,target);
  if coalesce(payload->>'pagePath','')='' then raise exception 'Page required' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'environment_id',i.environment_id,'page_path',i.page_path,
    'status',i.status,'priority',i.priority,'body',left(i.body,240),'authorName',coalesce(g.display_name,u.email,'Utente'),
    'context',jsonb_build_object('anchor',i.context->'anchor','scroll',i.context->'scroll')) order by i.created_at,i.id),'[]'::jsonb)
    from public.issues i left join public.guest_sessions g on g.id=i.guest_session_id left join auth.users u on u.id=i.author_id
    where i.environment_id=target and i.page_path=payload->>'pagePath');
end;
$$;
revoke all on function public.report_pins(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.report_pins(text,uuid,jsonb) to anon,authenticated;

-- Incremental notification pagination; preserves all existing notifications and read flags.
create index if not exists notifications_user_created_id on public.notifications(user_id,created_at desc,id desc);
create index if not exists notifications_guest_created_id on public.notifications(guest_session_id,created_at desc,id desc);
create or replace function public.notification_page(secret text, target uuid, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a jsonb; actor uuid; guest uuid; page_size integer; page_offset integer; summary boolean; result jsonb;
begin
  if target is null then
    if secret is not null or not public.can_read_project(null) then raise exception 'Not authorized' using errcode='42501'; end if;
    actor:=auth.uid();
  else
    a:=public.report_actor(secret,target); actor:=(a->>'userId')::uuid; guest:=(a->>'guestId')::uuid;
  end if;
  page_size:=coalesce((payload->>'limit')::integer,20); page_offset:=coalesce((payload->>'offset')::integer,0);
  summary:=coalesce(payload->>'mode','page')='summary';
  if page_size not between 1 and 100 or page_offset<0 or coalesce(payload->>'mode','page') not in ('page','summary') then
    raise exception 'Invalid pagination' using errcode='22023'; end if;
  with scoped as materialized (
    select n.id,i.id issue_id,i.project_id,i.environment_id,p.name project_name,e.name environment_name,i.page_path,i.body,
      n.kind,n.comment_id,c.body reply_body,n.previous_status,n.status,n.actor_name,n.created_at,n.read_at
    from public.notifications n join public.issues i on i.id=n.issue_id
    left join public.comments c on c.id=n.comment_id and c.issue_id=i.id
    join public.projects p on p.id=i.project_id join public.environments e on e.id=i.environment_id
    where ((actor is not null and n.user_id=actor) or (guest is not null and n.guest_session_id=guest))
      and (target is null or i.environment_id=target)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
  ), filtered as (
    select * from scoped where
      (coalesce(jsonb_array_length(payload->'projects'),0)=0 or payload->'projects' ? project_id::text)
      and (coalesce(jsonb_array_length(payload->'environments'),0)=0 or payload->'environments' ? environment_id::text)
      and (coalesce(jsonb_array_length(payload->'statuses'),0)=0 or payload->'statuses' ? status)
      and (coalesce(jsonb_array_length(payload->'reads'),0)=0 or payload->'reads' ? case when read_at is null then 'unread' else 'read' end)
  ), batch as (
    select * from filtered where not summary order by created_at desc,id desc limit page_size offset page_offset
  ), arrivals as (
    select * from scoped where payload ? 'after' and read_at is null
      and (created_at,id)>((payload->'after'->>'createdAt')::timestamptz,(payload->'after'->>'id')::uuid)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc,b.id desc) from batch b),'[]'::jsonb),
    'total',(select count(*) from filtered),'totalInScope',(select count(*) from scoped),
    'unread',(select count(*) from scoped where read_at is null),
    'cursor',(select jsonb_build_object('createdAt',created_at,'id',id) from scoped order by created_at desc,id desc limit 1),
    'arrivalCount',(select count(*) from arrivals),
    'latest',(select to_jsonb(n)||jsonb_build_object('body',left(n.body,120),'reply_body',left(n.reply_body,120)) from arrivals n order by created_at desc,id desc limit 1),
    'projects',(select coalesce(jsonb_agg(to_jsonb(p) order by p.label),'[]'::jsonb) from (select distinct project_id value,project_name label from scoped) p),
    'environments',(select coalesce(jsonb_agg(to_jsonb(e) order by e.label),'[]'::jsonb) from (select distinct environment_id value,project_id,project_name||' · '||environment_name label from scoped) e)) into result;
  return result;
end;
$$;
revoke all on function public.notification_page(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.notification_page(text,uuid,jsonb) to anon,authenticated;

create or replace function public.notification_operation(secret text, target uuid, operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; actor uuid; guest uuid; result jsonb;
begin
  if target is null then
    if secret is not null or not public.can_read_project(null) then raise exception 'Not authorized' using errcode='42501'; end if;
    actor:=auth.uid();
  else
    a:=public.report_actor(secret,target);
    actor:=(a->>'userId')::uuid; guest:=(a->>'guestId')::uuid;
  end if;
  if operation not in ('notifications','notification_read','notifications_read') or operation is null then
    raise exception 'Invalid operation' using errcode='22023';
  end if;
  if operation='notification_read' and not (payload ? 'id') then
    raise exception 'Notification required' using errcode='22023';
  end if;
  if operation in ('notification_read','notifications_read') then
    update public.notifications n set read_at=coalesce(n.read_at,clock_timestamp())
    from public.issues i where i.id=n.issue_id
      and ((actor is not null and n.user_id=actor) or (guest is not null and n.guest_session_id=guest))
      and (target is null or i.environment_id=target)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
      and (operation='notifications_read' or n.id=(payload->>'id')::uuid);
    if operation='notification_read' and not found then raise exception 'Notification unavailable' using errcode='42501'; end if;
  end if;
  if coalesce((payload->>'paginated')::boolean,false) then return public.notification_page(secret,target,payload); end if;
  select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc,row_data->>'id'),'[]'::jsonb) into result from (
    select jsonb_build_object('id',n.id,'issue_id',i.id,'project_id',i.project_id,'environment_id',i.environment_id,
      'project_name',p.name,'environment_name',e.name,'page_path',i.page_path,'body',i.body,
      'kind',n.kind,'comment_id',n.comment_id,'reply_body',c.body,'previous_status',n.previous_status,'status',n.status,'actor_name',n.actor_name,'created_at',n.created_at,'read_at',n.read_at) row_data
    from public.notifications n join public.issues i on i.id=n.issue_id
    left join public.comments c on c.id=n.comment_id and c.issue_id=i.id
    join public.projects p on p.id=i.project_id join public.environments e on e.id=i.environment_id
    where ((actor is not null and n.user_id=actor) or (guest is not null and n.guest_session_id=guest))
      and (target is null or i.environment_id=target)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
  ) rows;
  return result;
end;
$$;
revoke all on function public.notification_operation(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.notification_operation(text,uuid,text,jsonb) to anon,authenticated;
