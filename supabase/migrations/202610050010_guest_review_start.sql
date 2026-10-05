begin;

alter table public.guest_invites add column environment_id uuid references public.environments(id) on delete set null;
-- Older links start on the first environment, without changing guest project access.
update public.guest_invites i set environment_id=(select e.id from public.environments e where e.project_id=i.project_id order by e.created_at,e.id limit 1);

create function public.create_environment_guest_invite(target uuid, environment uuid, secret_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or not public.can_manage_project(target) then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.environments where id=environment and project_id=target) then raise exception 'Invalid environment' using errcode='22023'; end if;
  if secret_hash is null or secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash' using errcode='22023'; end if;
  insert into public.guest_invites(project_id,environment_id,token_hash,created_by) values(target,environment,secret_hash,auth.uid()) returning id into result;
  return result;
end;
$$;

create function public.preview_guest_review(secret text) returns table(project_id uuid, project_name text, environment_id uuid, environment_name text, origin text)
language sql stable security definer set search_path = '' as $$
  select p.id,p.name,e.id,e.name,e.origin from public.guest_invites i
  join public.projects p on p.id=i.project_id join public.environments e on e.id=i.environment_id and e.project_id=i.project_id
  where i.token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and i.revoked_at is null;
$$;
revoke all on function public.create_environment_guest_invite(uuid,uuid,text),public.preview_guest_review(text) from public;
grant execute on function public.create_environment_guest_invite(uuid,uuid,text) to authenticated;
grant execute on function public.preview_guest_review(text) to anon,authenticated;
commit;
