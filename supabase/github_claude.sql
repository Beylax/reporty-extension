-- Incremental migration: preserves existing accounts and Reporty data.
begin;
create table public.environment_repositories (
  environment_id uuid primary key references public.environments(id) on delete cascade,
  installation_id bigint not null check(installation_id > 0),
  repository_id bigint not null check(repository_id > 0),
  full_name text not null check(full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  base_branch text not null check(char_length(base_branch) between 1 and 255)
);
create table public.claude_tasks (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  environment_id uuid not null references public.environments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  status text not null default 'queued' check(status in ('queued','starting','running','publishing','succeeded','failed')),
  repository jsonb not null,
  snapshot jsonb not null,
  previous_status text not null,
  branch text not null unique,
  base_sha text,
  session_id text unique,
  message text not null default 'In attesa di avvio.',
  pr_url text,
  started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz
);
create unique index claude_one_active_task on public.claude_tasks(issue_id) where status in ('queued','starting','running','publishing');
create index claude_tasks_pending on public.claude_tasks(updated_at) where status in ('queued','starting','running','publishing');
alter table public.environment_repositories enable row level security;
alter table public.claude_tasks enable row level security;
revoke all on public.environment_repositories,public.claude_tasks from anon,authenticated;
grant select on public.environment_repositories to authenticated;
grant select(id,issue_id,environment_id,project_id,status,message,pr_url,created_at,updated_at) on public.claude_tasks to authenticated;
grant all on public.environment_repositories,public.claude_tasks to service_role;
create policy repositories_read on public.environment_repositories for select to authenticated
using(exists(select 1 from public.environments e where e.id=environment_id and public.can_read_project(e.project_id)));
create policy claude_tasks_read on public.claude_tasks for select to authenticated using(public.can_read_project(project_id));

create function public.claude_issue_locked(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.claude_tasks where issue_id=target and status in ('queued','starting','running','publishing'));
$$;
revoke all on function public.claude_issue_locked(uuid) from public,anon,authenticated;

-- Row locks serialize starts with edits/deletes. Comments deliberately remain writable.
create function public.claude_guard_issue() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if public.claude_issue_locked(old.id) then raise exception 'Claude task active' using errcode='55000'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger claude_guard_issue before update or delete on public.issues for each row execute function public.claude_guard_issue();
create function public.claude_guard_parent() returns trigger language plpgsql security definer set search_path='' as $$
declare project uuid; environment uuid;
begin
  if tg_table_name='projects' then project:=old.id;
  elsif tg_table_name='environments' then project:=old.project_id; environment:=old.id;
  else
    environment:=coalesce(new.environment_id,old.environment_id);
    select project_id into project from public.environments where id=environment;
  end if;
  perform 1 from public.projects where id=project for update;
  if exists(select 1 from public.claude_tasks where project_id=project and (environment is null or environment_id=environment) and status in ('queued','starting','running','publishing')) then
    raise exception 'Claude task active' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger claude_guard_project before delete on public.projects for each row execute function public.claude_guard_parent();
create trigger claude_guard_environment before update or delete on public.environments for each row execute function public.claude_guard_parent();
create trigger claude_guard_repository before insert or update or delete on public.environment_repositories for each row execute function public.claude_guard_parent();

create function public.start_claude_task(target uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare report public.issues; repository public.environment_repositories; task uuid:=gen_random_uuid(); project uuid;
begin
  select project_id into project from public.issues where id=target;
  if not coalesce(public.can_manage_project(project),false) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.projects where id=project for update;
  select * into report from public.issues where id=target for update;
  if report.id is null then raise exception 'Report unavailable' using errcode='42501'; end if;
  if public.claude_issue_locked(target) then raise exception 'Claude task active' using errcode='55000'; end if;
  select * into repository from public.environment_repositories where environment_id=report.environment_id;
  if repository.environment_id is null then raise exception 'Repository required' using errcode='22023'; end if;
  update public.issues set status='in_progress' where id=target;
  insert into public.claude_tasks(id,issue_id,environment_id,project_id,created_by,repository,snapshot,previous_status,branch)
  values(task,target,report.environment_id,report.project_id,auth.uid(),to_jsonb(repository),
    jsonb_build_object('body',report.body,'context',report.context,'screenshot_path',report.screenshot_path,
      'comments',coalesce((select jsonb_agg(jsonb_build_object('body',body) order by created_at) from public.comments where issue_id=target),'[]'::jsonb)),
    report.status,'reporty/claude-'||task::text);
  return task;
end;
$$;
revoke all on function public.start_claude_task(uuid) from public,anon,authenticated;
grant execute on function public.start_claude_task(uuid) to authenticated;

-- Backend-only: the caller has already verified the GitHub user's repository access.
create function public.save_github_environment(actor uuid, project uuid, environment uuid, label text, site_origin text, repository jsonb, replace_repository boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform 1 from public.projects where id=project for update;
  if not found then raise exception 'Project unavailable' using errcode='42501'; end if;
  if environment is null then
    -- Creation triggers use auth.uid() for the guest-link author.
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'is_anonymous',false)::text,true);
    insert into public.environments(project_id,name,origin) values(project,label,site_origin) returning id into result;
  else
    update public.environments set name=label,origin=site_origin where id=environment and project_id=project returning id into result;
    if result is null then raise exception 'Environment unavailable' using errcode='42501'; end if;
  end if;
  if replace_repository then
    if repository is null then delete from public.environment_repositories where environment_id=result;
    else
      insert into public.environment_repositories(environment_id,installation_id,repository_id,full_name,base_branch)
      values(result,(repository->>'installation_id')::bigint,(repository->>'repository_id')::bigint,repository->>'full_name',repository->>'base_branch')
      on conflict(environment_id) do update set installation_id=excluded.installation_id,repository_id=excluded.repository_id,full_name=excluded.full_name,base_branch=excluded.base_branch;
    end if;
  end if;
  return result;
end;
$$;
revoke all on function public.save_github_environment(uuid,uuid,uuid,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_github_environment(uuid,uuid,uuid,text,text,jsonb,boolean) to service_role;

create function public.create_github_project(actor uuid,label text,site_origin text,repository jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare project uuid; environment uuid;
begin
  if not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Not authorized' using errcode='42501'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'is_anonymous',false)::text,true);
  project:=public.create_project_with_production(label,site_origin);
  select id into environment from public.environments where project_id=project;
  perform public.save_github_environment(actor,project,environment,'Produzione',site_origin,repository);
  return project;
end;
$$;
revoke all on function public.create_github_project(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_github_project(uuid,text,text,jsonb) to service_role;

create function public.claim_claude_task(target uuid, lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.claude_tasks;
begin
  update public.claude_tasks set lease_id=lease,lease_until=now()+interval '180 seconds'
    where id=target and status in ('queued','starting','running','publishing') and (lease_until is null or lease_until<now()) returning * into result;
  if result.id is null then return null; end if;
  return to_jsonb(result);
end;
$$;
revoke all on function public.claim_claude_task(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_claude_task(uuid,uuid) to service_role;
create function public.finish_claude_task(target uuid, lease uuid, succeeded boolean, detail text, pull_request text default null) returns void
language plpgsql security definer set search_path='' as $$
declare task public.claude_tasks;
begin
  select * into task from public.claude_tasks where id=target and lease_id=lease and lease_until>now() and status in ('queued','starting','running','publishing') for update;
  if task.id is null then raise exception 'Task lease expired' using errcode='55000'; end if;
  if succeeded and (pull_request is null or pull_request !~ '^https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/pull/[0-9]+$') then raise exception 'Invalid pull request'; end if;
  update public.claude_tasks set status=case when succeeded then 'succeeded' else 'failed' end,message=left(detail,1000),pr_url=pull_request,updated_at=now(),lease_id=null,lease_until=null where id=target;
  update public.issues set status=case when succeeded then 'validation' else task.previous_status end where id=task.issue_id;
end;
$$;
revoke all on function public.finish_claude_task(uuid,uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.finish_claude_task(uuid,uuid,boolean,text,text) to service_role;
revoke all on function public.claude_guard_issue(),public.claude_guard_parent() from public,anon,authenticated;

-- Wrap the existing RPC without changing guest/widget authorization or comment behavior.
alter function public.report_operation(text,uuid,text,jsonb) rename to report_operation_without_claude;
revoke all on function public.report_operation_without_claude(text,uuid,text,jsonb) from public,anon,authenticated;
create function public.report_operation(secret text,target uuid,operation text,payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.report_operation_without_claude(secret,target,operation,payload);
  if operation='list' then
    select coalesce(jsonb_agg(item || jsonb_build_object('claudeLocked',public.claude_issue_locked((item->>'id')::uuid),
      'canEdit',coalesce((item->>'canEdit')::boolean,false) and not public.claude_issue_locked((item->>'id')::uuid),
      'canChangeStatus',coalesce((item->>'canChangeStatus')::boolean,false) and not public.claude_issue_locked((item->>'id')::uuid))),'[]'::jsonb)
      into result from jsonb_array_elements(result) item;
  end if;
  return result;
end;
$$;
revoke all on function public.report_operation(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.report_operation(text,uuid,text,jsonb) to anon,authenticated;
commit;
