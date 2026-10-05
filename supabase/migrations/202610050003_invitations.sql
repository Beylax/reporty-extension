begin;

create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email = lower(trim(email))),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);
alter table public.member_invites enable row level security;
revoke all on public.member_invites from anon, authenticated;
grant select (id, project_id, email, created_at, revoked_at, accepted_at) on public.member_invites to authenticated;
create policy member_invites_read on public.member_invites for select to authenticated
using (public.can_manage_project(project_id));

grant select (id, project_id, created_at, revoked_at) on public.guest_invites to authenticated;
create policy guest_invites_read on public.guest_invites for select to authenticated
using (public.can_manage_project(project_id));
create index member_invites_project on public.member_invites(project_id);
create index guest_invites_project on public.guest_invites(project_id);

create function public.create_member_invite(target uuid, invited_email text, secret_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or not public.can_manage_project(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if invited_email is null or length(invited_email) > 254 or invited_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  insert into public.member_invites(project_id, email, token_hash, created_by)
  values (target, lower(trim(invited_email)), secret_hash, auth.uid()) returning id into result;
  return result;
end;
$$;

create function public.accept_member_invite(secret text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.member_invites; current_email text;
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Login required' using errcode = '42501';
  end if;
  select lower(email) into current_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  select * into invitation from public.member_invites
  where token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') for update;
  if invitation.id is null or invitation.revoked_at is not null or current_email is null or invitation.email <> current_email then
    raise exception 'Invalid invitation or email' using errcode = '42501';
  end if;
  if invitation.accepted_at is not null then
    if invitation.accepted_by = auth.uid() and exists (
      select 1 from public.project_members where project_id = invitation.project_id and user_id = auth.uid()
    ) then return invitation.project_id; end if;
    raise exception 'Invitation already used' using errcode = '42501';
  end if;
  insert into public.project_members(project_id, user_id, role)
  values (invitation.project_id, auth.uid(), 'member') on conflict do nothing;
  update public.member_invites set accepted_at = now(), accepted_by = auth.uid() where id = invitation.id;
  return invitation.project_id;
end;
$$;

create function public.create_guest_invite(target uuid, secret_hash text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or not public.can_manage_project(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if secret_hash is null or secret_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid hash'; end if;
  insert into public.guest_invites(project_id, token_hash, created_by)
  values (target, secret_hash, auth.uid()) returning id into result;
  return result;
end;
$$;

create function public.revoke_project_invite(target uuid, invitation_id uuid, invitation_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_project(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if invitation_kind = 'member' then
    update public.member_invites set revoked_at = coalesce(revoked_at, now())
    where id = invitation_id and project_id = target;
  elsif invitation_kind = 'guest' then
    update public.guest_invites set revoked_at = coalesce(revoked_at, now())
    where id = invitation_id and project_id = target;
  else raise exception 'Invalid invitation kind'; end if;
end;
$$;

create function public.list_project_members(target uuid)
returns table(user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_project(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query select m.user_id, u.email::text, m.role from public.project_members m
  join auth.users u on u.id = m.user_id where m.project_id = target order by m.role, u.email;
end;
$$;

-- Public RPCs reveal only a project's name to a valid invitation bearer.
create function public.preview_guest_invite(secret text)
returns table(project_id uuid, project_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name from public.guest_invites i join public.projects p on p.id = i.project_id
  where i.token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') and i.revoked_at is null;
$$;

create function public.start_guest_session(secret text, guest_name text, session_secret text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.guest_invites; result uuid;
begin
  if guest_name is null or length(trim(guest_name)) not between 1 and 80 or
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

create function public.get_guest_session(secret text)
returns table(session_id uuid, project_id uuid, project_name text, display_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.project_id, p.name, s.display_name from public.guest_sessions s
  join public.guest_invites i on i.id = s.invite_id and i.project_id = s.project_id
  join public.projects p on p.id = s.project_id
  where s.token_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex') and i.revoked_at is null;
$$;

revoke all on function public.create_member_invite(uuid,text,text), public.accept_member_invite(text),
public.create_guest_invite(uuid,text), public.revoke_project_invite(uuid,uuid,text), public.list_project_members(uuid),
public.preview_guest_invite(text), public.start_guest_session(text,text,text), public.get_guest_session(text) from public;
grant execute on function public.create_member_invite(uuid,text,text), public.accept_member_invite(text),
public.create_guest_invite(uuid,text), public.revoke_project_invite(uuid,uuid,text), public.list_project_members(uuid) to authenticated;
grant execute on function public.preview_guest_invite(text), public.start_guest_session(text,text,text), public.get_guest_session(text) to anon, authenticated;

commit;
