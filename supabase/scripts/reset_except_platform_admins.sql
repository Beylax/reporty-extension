-- DESTRUCTIVE: run manually in Supabase SQL Editor, never as a migration.
-- First empty the screenshots bucket through Supabase Storage (keep the bucket).
-- Preserves all platform administrators and their Auth accounts.
begin;

lock table public.platform_admins in share mode;

do $$
begin
  if not exists (
    select 1 from public.platform_admins a join auth.users u on u.id = a.user_id
  ) then
    raise exception 'Reset annullato: nessun amministratore generale registrato in platform_admins.';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'screenshots') then
    raise exception 'Reset annullato: svuota prima il bucket screenshots da Supabase Storage, senza eliminare il bucket.';
  end if;
end;
$$;

delete from public.extension_handoffs;
delete from public.extension_sessions;
delete from public.comments;
delete from public.issues;
delete from public.member_invites;
delete from public.guest_sessions;
delete from public.environment_review_links;
delete from public.guest_invites;
delete from public.environments;
delete from public.project_members;
delete from public.projects;

delete from auth.users u
where not exists (select 1 from public.platform_admins a where a.user_id = u.id);

-- Show the administrator accounts retained by this reset.
select u.id, u.email
from auth.users u join public.platform_admins a on a.user_id = u.id;

commit;
