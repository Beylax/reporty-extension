begin;

-- Every registered developer shares the same dashboard permissions.
create or replace function public.can_read_project(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false);
$$;
create or replace function public.can_manage_project(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_project(target);
$$;

-- Old individual links are retired; reports and their author history are retained.
update public.member_invites set revoked_at=coalesce(revoked_at,now());
update public.guest_invites set revoked_at=coalesce(revoked_at,now());
revoke execute on function public.create_member_invite(uuid,text,text), public.accept_member_invite(text),
public.create_guest_invite(uuid,text), public.create_environment_guest_invite(uuid,uuid,text),
public.revoke_project_invite(uuid,uuid,text), public.manage_project_member(uuid,uuid,text,text) from authenticated;

-- The readable bearer token is available only to authenticated developers, so
-- they can recover and share the same project link from another browser.
create table public.project_review_links (
  project_id uuid primary key references public.projects(id) on delete cascade,
  invite_id uuid not null unique references public.guest_invites(id),
  token text not null unique check(token ~ '^[0-9a-f]{64}$')
);
alter table public.project_review_links enable row level security;
revoke all on public.project_review_links from anon,authenticated;
grant select on public.project_review_links to authenticated;
create policy review_link_read on public.project_review_links for select to authenticated using(public.can_read_project(project_id));

create function public.save_project_review_link(target uuid, environment uuid, regenerate boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare existing public.project_review_links; secret text; invitation uuid;
begin
  if not public.can_manage_project(target) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.projects where id=target for update;
  if not found then raise exception 'Project unavailable' using errcode='22023'; end if;
  if not exists(select 1 from public.environments where id=environment and project_id=target) then raise exception 'Invalid environment' using errcode='22023'; end if;
  select * into existing from public.project_review_links where project_id=target;
  if existing.project_id is not null and not regenerate then
    update public.guest_invites set environment_id=environment where id=existing.invite_id;
    return existing.token;
  end if;
  if existing.project_id is not null then
    update public.guest_invites set revoked_at=now() where id=existing.invite_id;
  end if;
  secret := encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.guest_invites(project_id,environment_id,token_hash,created_by)
    values(target,environment,encode(sha256(convert_to(secret,'UTF8')),'hex'),auth.uid()) returning id into invitation;
  insert into public.project_review_links(project_id,invite_id,token) values(target,invitation,secret)
    on conflict(project_id) do update set invite_id=excluded.invite_id,token=excluded.token;
  return secret;
end;
$$;
revoke all on function public.save_project_review_link(uuid,uuid,boolean) from public;
grant execute on function public.save_project_review_link(uuid,uuid,boolean) to authenticated;
grant select (environment_id) on public.guest_invites to authenticated;
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
  select coalesce(jsonb_agg(screenshot_path),'[]'::jsonb) into paths from public.issues
    where project_id=project and (kind='project' or environment_id=target) and screenshot_path is not null;
  -- Remove issues first because the environment FK does not cascade.
  delete from public.issues where project_id=project and (kind='project' or environment_id=target);
  if kind='project' then delete from public.projects where id=target;
  else delete from public.environments where id=target; end if;
  return paths;
end;
$$;

commit;
