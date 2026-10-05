-- Non-destructive update: public review widget per environment, disabled by default.
begin;
create table public.environment_widgets (
  environment_id uuid primary key references public.environments(id) on delete cascade,
  public_key uuid not null unique default gen_random_uuid(),
  enabled boolean not null default false
);
create table public.widget_sessions (
  token_hash text primary key,
  environment_id uuid not null references public.environments(id) on delete cascade,
  guest_session_id uuid not null references public.guest_sessions(id) on delete cascade,
  origin text not null,
  expires_at timestamptz not null default now()+interval '1 day'
);
alter table public.environment_widgets enable row level security;
alter table public.widget_sessions enable row level security;
revoke all on public.environment_widgets,public.widget_sessions from anon,authenticated;
grant select on public.environment_widgets to authenticated;
grant update(enabled) on public.environment_widgets to authenticated;
create policy widget_read on public.environment_widgets for select to authenticated using(public.can_read_project(environment_id));
create policy widget_toggle on public.environment_widgets for update to authenticated using(public.can_manage_project(environment_id)) with check(public.can_manage_project(environment_id));
create function public.add_environment_widget() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.environment_widgets(environment_id) values(new.id); return new; end;
$$;
revoke all on function public.add_environment_widget() from public;
create trigger environment_widget_created after insert on public.environments for each row execute function public.add_environment_widget();
insert into public.environment_widgets(environment_id) select id from public.environments;

create function public.widget_config(key uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',w.enabled,'environment',jsonb_build_object('id',e.id,'projectId',p.id,'projectName',p.name,'name',e.name,'origin',e.origin))
 from public.environment_widgets w join public.environments e on e.id=w.environment_id join public.projects p on p.id=e.project_id where w.public_key=key;
$$;
create function public.widget_authorize(secret text, request_origin text) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
 select s.environment_id into result from public.widget_sessions s join public.environment_widgets w on w.environment_id=s.environment_id
 join public.environments e on e.id=s.environment_id join public.guest_sessions g on g.id=s.guest_session_id join public.guest_invites i on i.id=g.invite_id
 where s.token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and s.expires_at>now() and w.enabled and i.revoked_at is null and s.origin=e.origin and e.origin=request_origin;
 if result is null then raise exception 'Widget disabled or session unavailable' using errcode='42501'; end if;
 return result;
end;
$$;
create function public.start_widget_session(key uuid, request_origin text, guest_name text, session_secret text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.environments; guest uuid; invitation uuid;
begin
 select e.* into target from public.environment_widgets w join public.environments e on e.id=w.environment_id where w.public_key=key and w.enabled and e.origin=request_origin for share of w;
 if target.id is null then raise exception 'Widget unavailable' using errcode='42501'; end if;
 if guest_name is null or char_length(trim(guest_name)) not between 1 and 80 or session_secret is null or session_secret !~ '^[0-9a-f]{64}$' then raise exception 'Invalid details' using errcode='22023'; end if;
 select invite_id into invitation from public.environment_review_links where environment_id=target.id;
 insert into public.guest_sessions(project_id,invite_id,token_hash,display_name) values(target.project_id,invitation,encode(sha256(convert_to(session_secret,'UTF8')),'hex'),trim(guest_name)) returning id into guest;
 insert into public.widget_sessions(token_hash,environment_id,guest_session_id,origin) values(encode(sha256(convert_to(session_secret,'UTF8')),'hex'),target.id,guest,target.origin);
end;
$$;
revoke all on function public.widget_config(uuid),public.widget_authorize(text,text),public.start_widget_session(uuid,text,text,text) from public;
grant execute on function public.widget_config(uuid),public.widget_authorize(text,text),public.start_widget_session(uuid,text,text,text) to anon,authenticated;

create or replace function public.report_actor(secret text, target uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare e public.environments; s public.extension_sessions; actor uuid; guest uuid; allowed boolean; manager boolean;
begin
  select * into e from public.environments where id = target;
  if e.id is null then raise exception 'Environment unavailable' using errcode='42501'; end if;
  if secret is null then
    actor := auth.uid();
    allowed := actor is not null and public.can_read_project(e.project_id);
    manager := public.can_manage_project(e.project_id);
  elsif exists(select 1 from public.widget_sessions where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex')) then
    perform public.widget_authorize(secret,e.origin);
    select guest_session_id into guest from public.widget_sessions where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and environment_id=target;
    allowed := guest is not null;
    manager := allowed;
  else
    perform public.extension_context(secret);
    select * into s from public.extension_sessions where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex');
    actor := s.user_id; guest := s.guest_session_id;
    allowed := (actor is not null and exists(select 1 from auth.users u where u.id=actor and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)))
      or exists(select 1 from public.guest_sessions g where g.id=guest and g.project_id=e.project_id);
    manager := actor is not null and allowed;
  end if;
  if not coalesce(allowed,false) then raise exception 'Not authorized' using errcode='42501'; end if;
  return jsonb_build_object('projectId',e.project_id,'userId',actor,'guestId',guest,'manager',coalesce(manager,false),'origin',e.origin);
end;
$$;

commit;
