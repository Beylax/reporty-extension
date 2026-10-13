-- Non-destructive: attachments for replies. Run manually before deploying the new backend.
begin;
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

create or replace function public.attachment_operation(secret text, target uuid, operation text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; report public.issues; item public.comment_attachments; actor uuid; guest uuid;
begin
  a := public.report_actor(secret,target); actor := (a->>'userId')::uuid; guest := (a->>'guestId')::uuid;
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

create or replace function public.report_operation(secret text, target uuid, operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare field_name text; anchor jsonb; dimensions jsonb; scroll_position jsonb; a jsonb; report public.issues; result jsonb; actor uuid; guest uuid; manager boolean; editable boolean; report_id uuid; text_body text; comment_uuid uuid; attachment_ids uuid[]; paths jsonb;
begin
  a := public.report_actor(secret,target); actor := (a->>'userId')::uuid; guest := (a->>'guestId')::uuid; manager := (a->>'manager')::boolean;
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
      or jsonb_typeof(payload->'context'->'anchor') is distinct from 'object' or coalesce(payload->'context'->'anchor'->>'kind','') not in ('pin','element')
      or jsonb_typeof(payload->'context'->'viewport') is distinct from 'object' or jsonb_typeof(payload->'context'->'scroll') is distinct from 'object'
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
    else
      foreach field_name in array array['documentX','documentY'] loop
        if jsonb_typeof(anchor->field_name) is distinct from 'number' then raise exception 'Invalid pin' using errcode='22023'; end if;
        if (anchor->>field_name)::numeric not between 0 and 10000000 then raise exception 'Invalid pin' using errcode='22023'; end if;
      end loop;
    end if;
    foreach field_name in array array['width','height','devicePixelRatio'] loop
      if jsonb_typeof(dimensions->field_name) is distinct from 'number' then raise exception 'Invalid viewport' using errcode='22023'; end if;
      if (dimensions->>field_name)::numeric <= 0 or (dimensions->>field_name)::numeric > 10000000 then raise exception 'Invalid viewport' using errcode='22023'; end if;
    end loop;
    foreach field_name in array array['x','y'] loop
      if jsonb_typeof(scroll_position->field_name) is distinct from 'number' then raise exception 'Invalid scroll' using errcode='22023'; end if;
      if (scroll_position->>field_name)::numeric not between 0 and 10000000 then raise exception 'Invalid scroll' using errcode='22023'; end if;
    end loop;
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
    return jsonb_build_object('issue',to_jsonb(report),'comments',result);
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
  elsif operation='screenshot' then
    if not coalesce(editable,false) and not (guest is not null and report.guest_session_id=guest) then raise exception 'Not authorized' using errcode='42501'; end if;
    update public.issues set screenshot_path=report.project_id::text||'/'||report.id::text||'.jpg' where id=report.id;
  elsif operation='delete' then
    if not coalesce(editable,false) then raise exception 'Not authorized' using errcode='42501'; end if;
    select coalesce(jsonb_agg(path),'[]'::jsonb) into paths from public.comment_attachments where issue_id=report.id;
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
  paths := paths || coalesce((select jsonb_agg(f.path) from public.comment_attachments f join public.issues i on i.id=f.issue_id where i.project_id=project and (kind='project' or i.environment_id=target)),'[]'::jsonb);
  -- Remove issues first because the environment FK does not cascade.
  delete from public.issues where project_id=project and (kind='project' or environment_id=target);
  if kind='project' then delete from public.projects where id=target;
  else delete from public.environments where id=target; end if;
  return paths;
end;
$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('attachments','attachments',false,2500000,null)
on conflict(id) do update set public=false,file_size_limit=2500000,allowed_mime_types=null;
commit;
