-- Incremental and rerunnable: preserves all accounts, reports, links and existing names.
-- Apply after widget.sql, report_updates.sql and reply_attachments.sql.
begin;
alter table public.guest_sessions alter column display_name drop not null;

create or replace function public.start_guest_session(secret text, guest_name text, session_secret text)
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

create or replace function public.start_widget_session(key uuid, request_origin text, guest_name text, session_secret text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.environments; guest uuid; invitation uuid;
begin
 select e.* into target from public.environment_widgets w join public.environments e on e.id=w.environment_id where w.public_key=key and w.enabled and e.origin=request_origin for share of w;
 if target.id is null then raise exception 'Widget unavailable' using errcode='42501'; end if;
 if (guest_name is not null and char_length(trim(guest_name)) not between 1 and 80) or session_secret is null or session_secret !~ '^[0-9a-f]{64}$' then raise exception 'Invalid details' using errcode='22023'; end if;
 select invite_id into invitation from public.environment_review_links where environment_id=target.id;
 insert into public.guest_sessions(project_id,invite_id,token_hash,display_name) values(target.project_id,invitation,encode(sha256(convert_to(session_secret,'UTF8')),'hex'),trim(guest_name)) returning id into guest;
 insert into public.widget_sessions(token_hash,environment_id,guest_session_id,origin) values(encode(sha256(convert_to(session_secret,'UTF8')),'hex'),target.id,guest,target.origin);
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

create or replace function public.report_operation(secret text, target uuid, operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare field_name text; anchor jsonb; dimensions jsonb; scroll_position jsonb; a jsonb; report public.issues; result jsonb; actor uuid; guest uuid; manager boolean; editable boolean; report_id uuid; text_body text; comment_uuid uuid; attachment_ids uuid[]; paths jsonb;
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

revoke all on function public.require_reviewer_name(text,uuid) from public,anon,authenticated;
revoke all on function public.reviewer_identity(text,uuid,text) from public,anon,authenticated;
grant execute on function public.reviewer_identity(text,uuid,text) to anon,authenticated;

commit;
