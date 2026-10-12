-- Incremental update for an existing notification system; preserves historical notifications.
-- Requires notifications.sql. No historical creation notifications are generated.
begin;
alter table public.notifications alter column previous_status drop not null;
create or replace function public.notify_issue_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare label text; previous text; actor uuid; guest uuid;
begin
  if tg_op='INSERT' then
    previous:=null; actor:=new.author_id; guest:=new.guest_session_id;
  else
    if new.status is not distinct from old.status then return new; end if;
    previous:=old.status; actor:=new.updated_by; guest:=new.updated_guest_session_id;
  end if;
  select coalesce(g.display_name,u.email,'Utente') into label
    from public.issues i left join auth.users u on u.id=actor
    left join public.guest_sessions g on g.id=guest where i.id=new.id;
  insert into public.notifications(issue_id,user_id,previous_status,status,actor_name)
    select new.id,u.id,previous,new.status,label from auth.users u
    where not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false);
  insert into public.notifications(issue_id,guest_session_id,previous_status,status,actor_name)
    select new.id,g.id,previous,new.status,label from public.guest_sessions g
    join public.guest_invites v on v.id=g.invite_id and v.revoked_at is null
    where g.project_id=new.project_id;
  return new;
end;
$$;
revoke all on function public.notify_issue_status() from public,anon,authenticated;
drop trigger if exists issue_status_notification on public.issues;
create trigger issue_status_notification after insert or update of status on public.issues
for each row execute function public.notify_issue_status();

commit;
