begin;

create table public.environment_review_links (
  environment_id uuid primary key references public.environments(id) on delete cascade,
  invite_id uuid not null unique references public.guest_invites(id),
  token text not null unique check(token ~ '^[0-9a-f]{64}$')
);
alter table public.environment_review_links enable row level security;
revoke all on public.environment_review_links from anon,authenticated;
grant select on public.environment_review_links to authenticated;
create policy environment_review_link_read on public.environment_review_links for select to authenticated
using(exists(select 1 from public.environments e where e.id=environment_id and public.can_read_project(e.project_id)));

-- Preserve the previously shared project link for its selected environment.
insert into public.environment_review_links(environment_id,invite_id,token)
select i.environment_id,l.invite_id,l.token from public.project_review_links l
join public.guest_invites i on i.id=l.invite_id
join public.environments e on e.id=i.environment_id and e.project_id=l.project_id
where i.revoked_at is null;

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
revoke all on function public.create_environment_review_link() from public;
create trigger environment_review_link_created after insert on public.environments
for each row execute function public.create_environment_review_link();

-- Existing environments also receive a link, without touching report history.
do $$
declare environment public.environments; secret text; invitation uuid; creator uuid;
begin
  for environment in select e.* from public.environments e where not exists(select 1 from public.environment_review_links l where l.environment_id=e.id) loop
    select created_by into creator from public.projects where id=environment.project_id;
    secret := encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex');
    insert into public.guest_invites(project_id,environment_id,token_hash,created_by)
      values(environment.project_id,environment.id,encode(sha256(convert_to(secret,'UTF8')),'hex'),creator) returning id into invitation;
    insert into public.environment_review_links(environment_id,invite_id,token) values(environment.id,invitation,secret);
  end loop;
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
revoke all on function public.regenerate_environment_review_link(uuid) from public;
grant execute on function public.regenerate_environment_review_link(uuid) to authenticated;
drop function public.save_project_review_link(uuid,uuid,boolean);
-- Historical links stay in guest_invites for author attribution and revocation.
drop table public.project_review_links;
commit;
