begin;

-- Limit updates to editable fields; IDs, ownership and timestamps stay immutable.
grant update (name) on public.projects to authenticated;
create policy project_rename on public.projects for update to authenticated
using (public.can_manage_project(id)) with check (public.can_manage_project(id));

grant insert on public.environments to authenticated;
grant update (name, origin) on public.environments to authenticated;
create policy environment_create on public.environments for insert to authenticated
with check (public.can_manage_project(project_id));
create policy environment_edit on public.environments for update to authenticated
using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));

commit;
