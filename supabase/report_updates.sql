-- Non-destructive update: last report editor and project participants.
-- Historical edits cannot be reconstructed; existing updated fields stay null.
begin;
alter table public.issues
  add column updated_at timestamptz,
  add column updated_by uuid references auth.users(id),
  add column updated_guest_session_id uuid,
  add constraint issues_updated_guest_project_fkey foreign key (updated_guest_session_id,project_id) references public.guest_sessions(id,project_id),
  add constraint issues_update_actor_check check (
    (updated_at is null and num_nonnulls(updated_by,updated_guest_session_id)=0) or
    (updated_at is not null and num_nonnulls(updated_by,updated_guest_session_id)=1)
  );

create or replace function public.report_operation(secret text, target uuid, operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare field_name text; anchor jsonb; dimensions jsonb; scroll_position jsonb; a jsonb; report public.issues; result jsonb; actor uuid; guest uuid; manager boolean; editable boolean; report_id uuid; text_body text;
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
    select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('authorName',coalesce(g.display_name,u.email,'Utente')) order by c.created_at),'[]'::jsonb)
    into result from public.comments c left join public.guest_sessions g on g.id=c.guest_session_id left join auth.users u on u.id=c.author_id where c.issue_id=report.id;
    return jsonb_build_object('issue',to_jsonb(report),'comments',result);
  elsif operation='reply' then
    text_body := trim(payload->>'body');
    if text_body is null or char_length(text_body) not between 1 and 10000 then raise exception 'Invalid comment' using errcode='22023'; end if;
    insert into public.comments(project_id,issue_id,body,author_id,guest_session_id) values(report.project_id,report.id,text_body,actor,guest);
  elsif operation='status' then
    if actor is null and guest is null then raise exception 'Not authorized' using errcode='42501'; end if;
    if payload->>'status' not in ('open','in_progress','validation','resolved') or payload->>'status' is null then raise exception 'Invalid status' using errcode='22023'; end if;
    update public.issues set status=payload->>'status' where id=report.id;
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
    delete from public.issues where id=report.id;
  else raise exception 'Unknown operation' using errcode='22023'; end if;
  if operation in ('status','priority','edit','screenshot') then
    update public.issues set updated_at=clock_timestamp(),updated_by=actor,updated_guest_session_id=guest where id=report.id
      and (operation='screenshot' or body is distinct from report.body or status is distinct from report.status or priority is distinct from report.priority);
    select * into report from public.issues where id=report.id;
  end if;
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
    select jsonb_build_object('key','guest:'||g.id::text,'kind','guest','name',g.display_name) from public.guest_sessions g where g.project_id=target
  ) participants;
  return result;
end;
$$;
revoke all on function public.list_project_participants(uuid) from public,anon,authenticated;
grant execute on function public.list_project_participants(uuid) to authenticated;
commit;
