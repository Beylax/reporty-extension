begin;

-- Project-scoped administration; lock the project so concurrent changes cannot
-- remove or demote the last administrator.
create function public.manage_project_member(target uuid, member_id uuid, operation text, new_role text default null) returns void
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
  if old_role='admin' and (operation='remove' or new_role='member') and
    (select count(*) from public.project_members where project_id=target and role='admin') <= 1 then
    raise exception 'Keep at least one project administrator' using errcode='22023';
  end if;
  if operation='remove' then
    delete from public.project_members where project_id=target and user_id=member_id;
  else
    update public.project_members set role=new_role where project_id=target and user_id=member_id;
  end if;
end;
$$;
revoke all on function public.manage_project_member(uuid,uuid,text,text) from public;
grant execute on function public.manage_project_member(uuid,uuid,text,text) to authenticated;
commit;
