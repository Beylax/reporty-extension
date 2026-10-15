-- Incremental notification pagination; preserves all existing notifications and read flags.
create index if not exists notifications_user_created_id on public.notifications(user_id,created_at desc,id desc);
create index if not exists notifications_guest_created_id on public.notifications(guest_session_id,created_at desc,id desc);
create or replace function public.notification_page(secret text, target uuid, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a jsonb; actor uuid; guest uuid; page_size integer; page_offset integer; summary boolean; result jsonb;
begin
  if target is null then
    if secret is not null or not public.can_read_project(null) then raise exception 'Not authorized' using errcode='42501'; end if;
    actor:=auth.uid();
  else
    a:=public.report_actor(secret,target); actor:=(a->>'userId')::uuid; guest:=(a->>'guestId')::uuid;
  end if;
  page_size:=coalesce((payload->>'limit')::integer,20); page_offset:=coalesce((payload->>'offset')::integer,0);
  summary:=coalesce(payload->>'mode','page')='summary';
  if page_size not between 1 and 100 or page_offset<0 or coalesce(payload->>'mode','page') not in ('page','summary') then
    raise exception 'Invalid pagination' using errcode='22023'; end if;
  with scoped as materialized (
    select n.id,i.id issue_id,i.project_id,i.environment_id,p.name project_name,e.name environment_name,i.page_path,i.body,
      n.kind,n.comment_id,c.body reply_body,n.previous_status,n.status,n.actor_name,n.created_at,n.read_at
    from public.notifications n join public.issues i on i.id=n.issue_id
    left join public.comments c on c.id=n.comment_id and c.issue_id=i.id
    join public.projects p on p.id=i.project_id join public.environments e on e.id=i.environment_id
    where ((actor is not null and n.user_id=actor) or (guest is not null and n.guest_session_id=guest))
      and (target is null or i.environment_id=target)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
  ), filtered as (
    select * from scoped where
      (coalesce(jsonb_array_length(payload->'projects'),0)=0 or payload->'projects' ? project_id::text)
      and (coalesce(jsonb_array_length(payload->'environments'),0)=0 or payload->'environments' ? environment_id::text)
      and (coalesce(jsonb_array_length(payload->'statuses'),0)=0 or payload->'statuses' ? status)
      and (coalesce(jsonb_array_length(payload->'reads'),0)=0 or payload->'reads' ? case when read_at is null then 'unread' else 'read' end)
  ), batch as (
    select * from filtered where not summary order by created_at desc,id desc limit page_size offset page_offset
  ), arrivals as (
    select * from scoped where payload ? 'after' and read_at is null
      and (created_at,id)>((payload->'after'->>'createdAt')::timestamptz,(payload->'after'->>'id')::uuid)
  )
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc,b.id desc) from batch b),'[]'::jsonb),
    'total',(select count(*) from filtered),'totalInScope',(select count(*) from scoped),
    'unread',(select count(*) from scoped where read_at is null),
    'cursor',(select jsonb_build_object('createdAt',created_at,'id',id) from scoped order by created_at desc,id desc limit 1),
    'arrivalCount',(select count(*) from arrivals),
    'latest',(select to_jsonb(n)||jsonb_build_object('body',left(n.body,120),'reply_body',left(n.reply_body,120)) from arrivals n order by created_at desc,id desc limit 1),
    'projects',(select coalesce(jsonb_agg(to_jsonb(p) order by p.label),'[]'::jsonb) from (select distinct project_id value,project_name label from scoped) p),
    'environments',(select coalesce(jsonb_agg(to_jsonb(e) order by e.label),'[]'::jsonb) from (select distinct environment_id value,project_id,project_name||' · '||environment_name label from scoped) e)) into result;
  return result;
end;
$$;
revoke all on function public.notification_page(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.notification_page(text,uuid,jsonb) to anon,authenticated;

create or replace function public.notification_operation(secret text, target uuid, operation text, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a jsonb; actor uuid; guest uuid; result jsonb;
begin
  if target is null then
    if secret is not null or not public.can_read_project(null) then raise exception 'Not authorized' using errcode='42501'; end if;
    actor:=auth.uid();
  else
    a:=public.report_actor(secret,target);
    actor:=(a->>'userId')::uuid; guest:=(a->>'guestId')::uuid;
  end if;
  if operation not in ('notifications','notification_read','notifications_read') or operation is null then
    raise exception 'Invalid operation' using errcode='22023';
  end if;
  if operation='notification_read' and not (payload ? 'id') then
    raise exception 'Notification required' using errcode='22023';
  end if;
  if operation in ('notification_read','notifications_read') then
    update public.notifications n set read_at=coalesce(n.read_at,clock_timestamp())
    from public.issues i where i.id=n.issue_id
      and ((actor is not null and n.user_id=actor) or (guest is not null and n.guest_session_id=guest))
      and (target is null or i.environment_id=target)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
      and (operation='notifications_read' or n.id=(payload->>'id')::uuid);
    if operation='notification_read' and not found then raise exception 'Notification unavailable' using errcode='42501'; end if;
  end if;
  if coalesce((payload->>'paginated')::boolean,false) then return public.notification_page(secret,target,payload); end if;
  select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc,row_data->>'id'),'[]'::jsonb) into result from (
    select jsonb_build_object('id',n.id,'issue_id',i.id,'project_id',i.project_id,'environment_id',i.environment_id,
      'project_name',p.name,'environment_name',e.name,'page_path',i.page_path,'body',i.body,
      'kind',n.kind,'comment_id',n.comment_id,'reply_body',c.body,'previous_status',n.previous_status,'status',n.status,'actor_name',n.actor_name,'created_at',n.created_at,'read_at',n.read_at) row_data
    from public.notifications n join public.issues i on i.id=n.issue_id
    left join public.comments c on c.id=n.comment_id and c.issue_id=i.id
    join public.projects p on p.id=i.project_id join public.environments e on e.id=i.environment_id
    where ((actor is not null and n.user_id=actor) or (guest is not null and n.guest_session_id=guest))
      and (target is null or i.environment_id=target)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
  ) rows;
  return result;
end;
$$;
revoke all on function public.notification_operation(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.notification_operation(text,uuid,text,jsonb) to anon,authenticated;
