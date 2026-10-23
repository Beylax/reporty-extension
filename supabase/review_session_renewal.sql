-- Non-destructive, repeatable update. Apply after reviewer_read_only.sql and widget_localhost.sql.
-- Retain the same token, guest identity and name, including after an idle expiration.
begin;

create or replace function public.renew_extension_session(secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare connection public.extension_sessions;
begin
  select * into connection from public.extension_sessions
    where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and revoked_at is null for update;
  if connection.id is null then raise exception 'Invalid session' using errcode='42501'; end if;
  if connection.guest_session_id is not null then
    perform 1 from public.guest_sessions g join public.guest_invites i on i.id=g.invite_id and i.project_id=g.project_id
      where g.id=connection.guest_session_id and i.revoked_at is null for share of i;
    if not found then raise exception 'Guest access revoked' using errcode='42501'; end if;
  else
    perform 1 from auth.users u where u.id=connection.user_id and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false);
    if not found then raise exception 'Invalid session' using errcode='42501'; end if;
  end if;
  -- Avoid writing on every poll. Never shorten an existing expiration.
  if connection.expires_at < now()+interval '15 days' then
    update public.extension_sessions set expires_at=now()+interval '30 days' where id=connection.id;
  end if;
  return public.extension_context(secret);
end;
$$;

create or replace function public.renew_widget_session(secret text, request_origin text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare connection public.widget_sessions;
begin
  select * into connection from public.widget_sessions
    where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and origin=request_origin for update;
  if connection.token_hash is null then raise exception 'Widget disabled or session unavailable' using errcode='42501'; end if;
  perform 1 from public.environment_widgets w join public.environments e on e.id=w.environment_id
    join public.guest_sessions g on g.id=connection.guest_session_id and g.project_id=e.project_id
    join public.guest_invites i on i.id=g.invite_id and i.project_id=g.project_id
    where w.environment_id=connection.environment_id and w.enabled and i.revoked_at is null
      and (connection.origin=e.origin or connection.origin ~ '^https?://localhost(:[0-9]{1,5})?$')
    for share of w,i,e;
  if not found then raise exception 'Widget disabled or session unavailable' using errcode='42501'; end if;
  if connection.expires_at < now()+interval '12 hours' then
    update public.widget_sessions set expires_at=now()+interval '1 day' where token_hash=connection.token_hash;
  end if;
  return public.widget_authorize(secret,request_origin);
end;
$$;

revoke all on function public.renew_extension_session(text),public.renew_widget_session(text,text) from public,anon,authenticated;
grant execute on function public.renew_extension_session(text),public.renew_widget_session(text,text) to anon,authenticated;
commit;
