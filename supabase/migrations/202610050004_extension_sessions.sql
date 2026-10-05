begin;

create table public.extension_handoffs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '60 seconds',
  used_at timestamptz,
  check (num_nonnulls(user_id, guest_session_id) = 1)
);
create table public.extension_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  guest_session_id uuid references public.guest_sessions(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  check (num_nonnulls(user_id, guest_session_id) = 1)
);
alter table public.extension_handoffs enable row level security;
alter table public.extension_sessions enable row level security;
revoke all on public.extension_handoffs, public.extension_sessions from anon, authenticated;

create function public.create_member_handoff(secret_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Login required' using errcode = '42501'; end if;
  if secret_hash is null or secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash'; end if;
  insert into public.extension_handoffs(token_hash, user_id) values (secret_hash, auth.uid());
end;
$$;

create function public.create_guest_handoff(guest_secret text, secret_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare guest uuid;
begin
  if secret_hash is null or secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash'; end if;
  select session_id into guest from public.get_guest_session(guest_secret);
  if guest is null then raise exception 'Invalid guest session' using errcode = '42501'; end if;
  insert into public.extension_handoffs(token_hash, guest_session_id) values (secret_hash, guest);
end;
$$;

create function public.redeem_extension_handoff(secret text, session_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare handoff public.extension_handoffs;
begin
  if session_secret is null or session_secret !~ '^[0-9a-f]{64}$' then raise exception 'Invalid session secret'; end if;
  select * into handoff from public.extension_handoffs where token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') for update;
  if handoff.id is null or handoff.used_at is not null or handoff.expires_at <= now() then raise exception 'Invalid handoff' using errcode = '42501'; end if;
  if handoff.guest_session_id is not null and not exists (
    select 1 from public.guest_sessions s join public.guest_invites i on i.id = s.invite_id
    where s.id = handoff.guest_session_id and i.revoked_at is null
  ) then raise exception 'Guest access revoked' using errcode = '42501'; end if;
  insert into public.extension_sessions(token_hash, user_id, guest_session_id)
  values (encode(sha256(convert_to(session_secret, 'UTF8')), 'hex'), handoff.user_id, handoff.guest_session_id);
  update public.extension_handoffs set used_at = now() where id = handoff.id;
end;
$$;

create function public.extension_context(secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare connection public.extension_sessions; guest_project uuid; label text; result jsonb;
begin
  select * into connection from public.extension_sessions
  where token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') and revoked_at is null and expires_at > now();
  if connection.id is null then raise exception 'Invalid session' using errcode = '42501'; end if;
  if connection.guest_session_id is not null then
    select s.project_id, s.display_name into guest_project, label from public.guest_sessions s
    join public.guest_invites i on i.id = s.invite_id where s.id = connection.guest_session_id and i.revoked_at is null;
    if guest_project is null then raise exception 'Guest access revoked' using errcode = '42501'; end if;
  else
    select email into label from auth.users where id = connection.user_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'projectId', p.id, 'projectName', p.name, 'name', e.name, 'origin', e.origin) order by p.name, e.name), '[]'::jsonb)
  into result from public.environments e join public.projects p on p.id = e.project_id
  where (guest_project is not null and p.id = guest_project) or (connection.user_id is not null and (
    exists (select 1 from public.platform_admins a where a.user_id = connection.user_id) or
    exists (select 1 from public.project_members m where m.user_id = connection.user_id and m.project_id = p.id)
  ));
  return jsonb_build_object('kind', case when guest_project is null then 'member' else 'guest' end, 'displayName', label, 'environments', result);
end;
$$;

create function public.revoke_extension_session(secret text) returns void
language sql security definer set search_path = '' as $$
  update public.extension_sessions set revoked_at = coalesce(revoked_at, now())
  where token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex');
$$;

revoke all on function public.create_member_handoff(text), public.create_guest_handoff(text,text),
public.redeem_extension_handoff(text,text), public.extension_context(text), public.revoke_extension_session(text) from public;
grant execute on function public.create_member_handoff(text) to authenticated;
grant execute on function public.create_guest_handoff(text,text), public.redeem_extension_handoff(text,text),
public.extension_context(text), public.revoke_extension_session(text) to anon, authenticated;
commit;
