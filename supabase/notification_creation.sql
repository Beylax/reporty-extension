-- Incremental notification events for existing installations, including replies.
-- Requires notifications.sql. Preserves history and does not backfill old events.
begin;
alter table public.notifications alter column previous_status drop not null;
alter table public.notifications add column if not exists kind text not null default 'status_changed' check(kind in ('created','status_changed','reply'));
alter table public.notifications add column if not exists comment_id uuid references public.comments(id) on delete cascade;
-- Preserve historical creation events and read receipts when adding explicit event types.
update public.notifications set kind='created' where previous_status is null and kind='status_changed';
create or replace function public.notify_issue_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare label text; previous text; actor uuid; guest uuid; event_kind text;
begin
  if tg_op='INSERT' then
    event_kind:='created'; previous:=null; actor:=new.author_id; guest:=new.guest_session_id;
  else
    if new.status is not distinct from old.status then return new; end if;
    event_kind:='status_changed'; previous:=old.status; actor:=new.updated_by; guest:=new.updated_guest_session_id;
  end if;
  select coalesce(g.display_name,u.email,'Utente') into label
    from public.issues i left join auth.users u on u.id=actor
    left join public.guest_sessions g on g.id=guest where i.id=new.id;
  insert into public.notifications(issue_id,user_id,previous_status,status,actor_name,kind)
    select new.id,u.id,previous,new.status,label,event_kind from auth.users u
    where not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false);
  insert into public.notifications(issue_id,guest_session_id,previous_status,status,actor_name,kind)
    select new.id,g.id,previous,new.status,label,event_kind from public.guest_sessions g
    join public.guest_invites v on v.id=g.invite_id and v.revoked_at is null
    where g.project_id=new.project_id;
  return new;
end;
$$;
revoke all on function public.notify_issue_status() from public,anon,authenticated;
drop trigger if exists issue_status_notification on public.issues;
create trigger issue_status_notification after insert or update of status on public.issues
for each row execute function public.notify_issue_status();

create or replace function public.notify_issue_reply() returns trigger
language plpgsql security definer set search_path='' as $$
declare report public.issues; label text;
begin
  select * into report from public.issues where id=new.issue_id and project_id=new.project_id;
  select coalesce(g.display_name,u.email,'Utente') into label
    from public.comments c left join auth.users u on u.id=new.author_id
    left join public.guest_sessions g on g.id=new.guest_session_id where c.id=new.id;
  insert into public.notifications(issue_id,user_id,kind,comment_id,status,actor_name)
    select report.id,u.id,'reply',new.id,report.status,label from auth.users u
    where not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false);
  insert into public.notifications(issue_id,guest_session_id,kind,comment_id,status,actor_name)
    select report.id,g.id,'reply',new.id,report.status,label from public.guest_sessions g
    join public.guest_invites v on v.id=g.invite_id and v.revoked_at is null
    where g.project_id=report.project_id;
  return new;
end;
$$;
revoke all on function public.notify_issue_reply() from public,anon,authenticated;
drop trigger if exists issue_reply_notification on public.comments;
create trigger issue_reply_notification after insert on public.comments
for each row execute function public.notify_issue_reply();

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


commit;
