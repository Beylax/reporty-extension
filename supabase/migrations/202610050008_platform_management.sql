begin;

create function public.platform_delete_resource(target uuid, kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare project uuid; paths jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Platform administrators only' using errcode='42501';
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
revoke all on function public.platform_delete_resource(uuid,text) from public;
grant execute on function public.platform_delete_resource(uuid,text) to authenticated;
commit;
