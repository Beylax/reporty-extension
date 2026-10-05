begin;

-- Project admins can delete their environments. Admin memberships are protected.
create or replace function public.manage_project_member(target uuid, member_id uuid, operation text, new_role text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare old_role text;
begin
  if auth.uid() is null or not public.can_manage_project(target) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  perform 1 from public.projects where id=target for update;
  if not found then raise exception 'Project unavailable' using errcode='42501'; end if;
  -- Recheck after acquiring the lock in case a concurrent change removed access.
  if not public.can_manage_project(target) then raise exception 'Not authorized' using errcode='42501'; end if;
  select role into old_role from public.project_members where project_id=target and user_id=member_id;
  if old_role is null then raise exception 'Member unavailable' using errcode='22023'; end if;
  if operation not in ('role','remove') or operation is null then raise exception 'Invalid operation' using errcode='22023'; end if;
  if operation='role' and (new_role is null or new_role not in ('admin','member')) then raise exception 'Invalid role' using errcode='22023'; end if;
  if old_role='admin' and (operation='remove' or (operation='role' and new_role <> 'admin')) then
    raise exception 'Project administrators are protected' using errcode='42501';
  end if;
  if operation='remove' then
    delete from public.project_members where project_id=target and user_id=member_id;
  else
    update public.project_members set role=new_role where project_id=target and user_id=member_id;
  end if;
end;
$$;

create or replace function public.platform_delete_resource(target uuid, kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare project uuid; paths jsonb;
begin
  if auth.uid() is null then
    raise exception 'Platform administrators only' using errcode='42501';
  end if;
  if kind='project' then
    if not public.is_platform_admin() then raise exception 'Platform administrators only' using errcode='42501'; end if;
    select id into project from public.projects where id=target for update;
  elsif kind='environment' then
    select project_id into project from public.environments where id=target;
    if project is null or not public.can_manage_project(project) then raise exception 'Not authorized' using errcode='42501'; end if;
    perform 1 from public.projects where id=project for update;
    if not public.can_manage_project(project) then raise exception 'Not authorized' using errcode='42501'; end if;
    perform 1 from public.environments where id=target and project_id=project for update;
    if not found then raise exception 'Resource unavailable' using errcode='22023'; end if;
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
