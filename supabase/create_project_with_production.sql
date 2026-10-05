-- Non-destructive update for an already initialized database.
begin;
create or replace function public.create_project_with_production(project_name text, site_origin text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare project uuid;
begin
  if not public.can_manage_project(null) then raise exception 'Not authorized' using errcode='42501'; end if;
  if project_name is null or char_length(trim(project_name)) not between 1 and 120 then raise exception 'Invalid name' using errcode='22023'; end if;
  if site_origin is null or site_origin !~ '^https?://[^/?#[:space:]@]+$' then raise exception 'Invalid origin' using errcode='22023'; end if;
  insert into public.projects(name,created_by) values(trim(project_name),auth.uid()) returning id into project;
  -- The environment trigger creates its guest invitation and readable link.
  insert into public.environments(project_id,name,origin) values(project,'Produzione',site_origin);
  return project;
end;
$$;
revoke all on function public.create_project_with_production(text,text) from public,anon,authenticated;
grant execute on function public.create_project_with_production(text,text) to authenticated;
commit;
