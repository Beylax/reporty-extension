-- Incremental, repeatable. Preserves existing accounts, reports and files.
-- Apply before enabling Supabase OAuth Server / the custom access token hook.
begin;

create table if not exists public.mcp_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null,
  client_name text not null check(char_length(client_name) between 1 and 120),
  project_id uuid not null references public.projects(id) on delete cascade,
  resource text not null check(resource ~ '^https?://[^?#]+/api/mcp$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists mcp_connection_active on public.mcp_connections(user_id,client_id) where revoked_at is null;
create table if not exists public.mcp_sessions (
  session_id uuid primary key,
  -- Keep the binding even if its project/connection is deleted: old refresh
  -- sessions must never attach to a later authorization.
  connection_id uuid not null
);
alter table public.mcp_sessions drop constraint if exists mcp_sessions_connection_id_fkey;
alter table public.mcp_connections enable row level security;
alter table public.mcp_sessions enable row level security;
revoke all on public.mcp_connections,public.mcp_sessions from public,anon,authenticated;
grant select on public.mcp_connections to authenticated;
drop policy if exists mcp_connection_read on public.mcp_connections;
create policy mcp_connection_read on public.mcp_connections for select to authenticated
  using(user_id=auth.uid() and auth.jwt()->>'client_id' is null and auth.jwt()->>'reporty_mcp_connection' is null);

-- OAuth credentials never inherit developer privileges, even outside /api/mcp.
create or replace function public.can_read_project(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    and auth.jwt()->>'client_id' is null and auth.jwt()->>'reporty_mcp_connection' is null;
$$;
create or replace function public.create_member_handoff(secret_hash text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.can_read_project(null) then raise exception 'Login required' using errcode='42501'; end if;
  if secret_hash is null or secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash'; end if;
  insert into public.extension_handoffs(token_hash,user_id) values(secret_hash,auth.uid());
end;
$$;

create or replace function public.authorize_mcp_connection(client uuid, client_label text, target uuid, resource_url text) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.mcp_connections; result uuid;
begin
  if not public.can_manage_project(target) then raise exception 'Not authorized' using errcode='42501'; end if;
  if client is null or client_label is null or resource_url is null then raise exception 'Invalid connection'; end if;
  -- A client has one active project per user. Never silently retarget existing tokens.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||client::text,0));
  select * into existing from public.mcp_connections where user_id=auth.uid() and client_id=client and revoked_at is null;
  if existing.id is not null then
    if existing.project_id<>target or existing.resource<>resource_url then
      raise exception 'Revoke the existing connection first' using errcode='22023';
    end if;
    return existing.id;
  end if;
  insert into public.mcp_connections(user_id,client_id,client_name,project_id,resource)
    values(auth.uid(),client,left(trim(client_label),120),target,resource_url) returning id into result;
  return result;
end;
$$;
create or replace function public.revoke_mcp_connection(connection uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.can_read_project(null) then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.mcp_connections set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=connection and user_id=auth.uid();
  if not found then raise exception 'Connection unavailable' using errcode='42501'; end if;
end;
$$;

-- Configure this function as the Supabase Custom Access Token Hook.
-- The immutable session binding prevents an old refresh token from being rebound
-- to a newly authorized project, including after revocation and reauthorization.
create or replace function public.mcp_access_token_hook(event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claims jsonb:=event->'claims'; client uuid; session uuid; connection public.mcp_connections; bound uuid;
begin
  client:=coalesce(event->>'client_id',claims->>'client_id')::uuid;
  if client is null then return jsonb_build_object('claims',claims); end if;
  session:=(claims->>'session_id')::uuid;
  if session is null or coalesce((claims->>'is_anonymous')::boolean,false) then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','MCP authorization required'));
  end if;
  select connection_id into bound from public.mcp_sessions where session_id=session;
  select * into connection from public.mcp_connections c
    where c.user_id=(event->>'user_id')::uuid and c.client_id=client and c.revoked_at is null
      and (bound is null or c.id=bound);
  if connection.id is null then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','MCP connection unavailable or revoked'));
  end if;
  insert into public.mcp_sessions(session_id,connection_id) values(session,connection.id) on conflict do nothing;
  if not exists(select 1 from public.mcp_sessions where session_id=session and connection_id=connection.id) then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','MCP session mismatch'));
  end if;
  claims:=claims||jsonb_build_object('client_id',client,'aud',connection.resource,
    'reporty_mcp_connection',connection.id,'reporty_mcp_project',connection.project_id);
  return jsonb_build_object('claims',claims);
end;
$$;

create or replace function public.mcp_current_connection() returns public.mcp_connections
language plpgsql stable security definer set search_path='' as $$
declare connection public.mcp_connections; claims jsonb:=auth.jwt();
begin
  select * into connection from public.mcp_connections c
    where c.id=(claims->>'reporty_mcp_connection')::uuid and c.user_id=auth.uid()
      and c.client_id=(claims->>'client_id')::uuid and c.project_id=(claims->>'reporty_mcp_project')::uuid
      and c.revoked_at is null and claims->>'aud'=c.resource
      and not coalesce((claims->>'is_anonymous')::boolean,false)
      and (claims->>'exp')::numeric>extract(epoch from now())
      and exists(select 1 from public.mcp_sessions s where s.session_id=(claims->>'session_id')::uuid and s.connection_id=c.id)
      and exists(select 1 from auth.sessions s where s.id=(claims->>'session_id')::uuid and s.user_id=c.user_id);
  if connection.id is null then raise exception 'MCP access denied' using errcode='42501'; end if;
  return connection;
end;
$$;

-- Only this RPC reads report data for OAuth tokens. No write operation exists.
create or replace function public.mcp_read(operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare connection public.mcp_connections; report public.issues; result jsonb; page_size integer; page_offset integer; shots text[]; file_path text;
begin
  connection:=public.mcp_current_connection();
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid payload' using errcode='22023'; end if;
  if operation='project' then
    select jsonb_build_object('id',p.id,'name',p.name,'environments',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'origin',e.origin) order by e.created_at,e.id)
      from public.environments e where e.project_id=p.id),'[]'::jsonb)) into result from public.projects p where p.id=connection.project_id;
    return result;
  end if;
  page_size:=coalesce((payload->>'limit')::integer,20); page_offset:=coalesce((payload->>'offset')::integer,0);
  if page_size not between 1 and 50 or page_offset not between 0 and 100000 or char_length(coalesce(payload->>'search',''))>1000 then
    raise exception 'Invalid pagination or search' using errcode='22023'; end if;
  if operation='reports' then
    if (payload ? 'statuses' and jsonb_typeof(payload->'statuses') is distinct from 'array')
      or (payload ? 'priorities' and jsonb_typeof(payload->'priorities') is distinct from 'array') then raise exception 'Invalid filters' using errcode='22023'; end if;
    with filtered as materialized (
      select i.id,i.project_id,i.environment_id,i.page_path,left(i.body,1000) body,i.status,i.priority,i.created_at,i.updated_at,e.name environment_name
      from public.issues i join public.environments e on e.id=i.environment_id where i.project_id=connection.project_id
        and (coalesce(payload->>'search','')='' or strpos(lower(i.body),lower(payload->>'search'))>0)
        and (coalesce(jsonb_array_length(payload->'statuses'),0)=0 or payload->'statuses' ? i.status)
        and (coalesce(jsonb_array_length(payload->'priorities'),0)=0 or payload->'priorities' ? i.priority)
        and (not(payload ? 'environmentId') or i.environment_id=(payload->>'environmentId')::uuid)
        and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
    ), batch as (select * from filtered order by case priority when 'high' then 0 when 'medium' then 1 else 2 end,created_at desc,id limit page_size offset page_offset)
    select jsonb_build_object('reports',coalesce((select jsonb_agg(to_jsonb(b) order by case priority when 'high' then 0 when 'medium' then 1 else 2 end,created_at desc,id) from batch b),'[]'::jsonb),
      'total',(select count(*) from filtered),'offset',page_offset,'limit',page_size) into result;
    return result;
  end if;
  select * into report from public.issues where id=(payload->>'id')::uuid and project_id=connection.project_id;
  if report.id is null then raise exception 'Report unavailable' using errcode='42501'; end if;
  shots:=report.screenshot_paths;
  if report.screenshot_path is not null and not report.screenshot_path=any(shots) then shots:=array_prepend(report.screenshot_path,shots); end if;
  if operation='report' then
    select jsonb_build_object('id',report.id,'project_id',report.project_id,'environment_id',report.environment_id,
      'environment_name',e.name,'page_path',report.page_path,'body',report.body,'status',report.status,'priority',report.priority,
      'context',report.context,'created_at',report.created_at,'updated_at',report.updated_at,'authorName',coalesce(g.display_name,u.email,'Utente'),
      'screenshotCount',cardinality(shots),'replyCount',(select count(*) from public.comments c where c.issue_id=report.id),
      'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'size',f.size,'mime',f.mime) order by f.created_at,f.id)
        from public.issue_attachments f where f.issue_id=report.id and f.committed and not f.removing),'[]'::jsonb))
      into result from public.environments e left join auth.users u on u.id=report.author_id left join public.guest_sessions g on g.id=report.guest_session_id where e.id=report.environment_id;
    return result;
  elsif operation='replies' then
    select jsonb_build_object('replies',coalesce(jsonb_agg(to_jsonb(b) order by b.created_at,b.id),'[]'::jsonb),
      'total',(select count(*) from public.comments where issue_id=report.id),'offset',page_offset,'limit',page_size) into result from (
      select c.id,c.body,c.created_at,coalesce(g.display_name,u.email,'Utente') "authorName",
        coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size) order by f.created_at,f.id)
          from public.comment_attachments f where f.comment_id=c.id and not f.removing),'[]'::jsonb) attachments
      from public.comments c left join auth.users u on u.id=c.author_id left join public.guest_sessions g on g.id=c.guest_session_id
      where c.issue_id=report.id order by c.created_at,c.id limit page_size offset page_offset
    ) b;
    return result;
  elsif operation='file' then
    if payload->>'kind'='screenshot' then
      file_path:=shots[coalesce((payload->>'index')::integer,0)+1];
      if file_path is null or coalesce((payload->>'index')::integer,0) not between 0 and 4 then raise exception 'Screenshot unavailable' using errcode='42501'; end if;
      return jsonb_build_object('bucket','screenshots','path',file_path,'name','screenshot.jpg','mime','image/jpeg');
    elsif payload->>'kind'='attachment' then
      select jsonb_build_object('bucket','report-attachments','path',f.path,'name',f.name,'mime',f.mime) into result
        from public.issue_attachments f where f.id=(payload->>'attachmentId')::uuid and f.issue_id=report.id and f.committed and not f.removing;
      if result is null then
        select jsonb_build_object('bucket','attachments','path',f.path,'name',f.name,'mime',f.mime) into result
          from public.comment_attachments f join public.comments c on c.id=f.comment_id and c.issue_id=f.issue_id
          where f.id=(payload->>'attachmentId')::uuid and f.issue_id=report.id and not f.removing;
      end if;
      if result is not null then return result; end if;
    end if;
    raise exception 'File unavailable' using errcode='42501';
  end if;
  raise exception 'Unsupported MCP operation' using errcode='22023';
end;
$$;

revoke all on function public.authorize_mcp_connection(uuid,text,uuid,text),public.revoke_mcp_connection(uuid),public.mcp_access_token_hook(jsonb),public.mcp_current_connection(),public.mcp_read(text,jsonb) from public,anon,authenticated;
grant execute on function public.authorize_mcp_connection(uuid,text,uuid,text),public.revoke_mcp_connection(uuid),public.mcp_read(text,jsonb) to authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.mcp_access_token_hook(jsonb) to supabase_auth_admin;
  end if;
end $$;
commit;
