-- Incremental, non-destructive pagination API. Apply before deploying the clients.
create index if not exists issues_environment_status_created_idx on public.issues(environment_id,status,created_at,id);
-- Match the UI's case/accent insensitive numeric ordering without extra extensions.
create or replace function public.report_text_sort(value text) returns text
language sql immutable strict set search_path = '' as $$
  select string_agg(case when part[1] ~ '^[0-9]+$'
    then chr(1)||lpad(length(ltrim(part[1],'0'))::text,8,'0')||ltrim(part[1],'0')
    else translate(lower(part[1]),'àáâäãåèéêëìíîïòóôöõùúûüçñ','aaaaaaeeeeiiiiooooouuuucn') end,'' order by ordinal)
  from regexp_matches(value,'[0-9]+|[^0-9]+','g') with ordinality as pieces(part,ordinal);
$$;
revoke all on function public.report_text_sort(text) from public,anon,authenticated;
create or replace function public.report_page(secret text, target uuid, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a jsonb; project_scope boolean; page_size integer; page_offset integer; sort_field text; sort_direction text; result jsonb;
begin
  a := public.report_actor(secret,target);
  project_scope := coalesce((payload->>'projectScope')::boolean,false);
  if project_scope and (a->>'userId' is null or not coalesce((a->>'manager')::boolean,false)) then raise exception 'Not authorized' using errcode='42501'; end if;
  page_size := coalesce((payload->>'limit')::integer,20);
  page_offset := coalesce((payload->>'offset')::integer,0);
  sort_field := coalesce(payload->'sort'->>'field','status');
  sort_direction := coalesce(payload->'sort'->>'direction','asc');
  if page_size not between 1 and 100 or page_offset < 0 or sort_direction not in ('asc','desc')
    or sort_field not in ('status','priority','created_at','updated_at','body','environment','authorName') then
    raise exception 'Invalid pagination' using errcode='22023'; end if;
  with scoped as materialized (
    select i.*, e.name environment_name, coalesce(g.display_name,u.email,'Utente') author_name,
      case when i.author_id is not null then 'user:'||i.author_id::text else 'guest:'||i.guest_session_id::text end author_key,
      coalesce(ug.display_name,uu.email) updated_name,
      case when i.updated_by is not null then 'user:'||i.updated_by::text when i.updated_guest_session_id is not null then 'guest:'||i.updated_guest_session_id::text end updated_key
    from public.issues i join public.environments e on e.id=i.environment_id
      left join public.guest_sessions g on g.id=i.guest_session_id left join auth.users u on u.id=i.author_id
      left join public.guest_sessions ug on ug.id=i.updated_guest_session_id left join auth.users uu on uu.id=i.updated_by
    where (case when project_scope then i.project_id=(a->>'projectId')::uuid else i.environment_id=target end)
      and (not(payload ? 'pagePath') or i.page_path=payload->>'pagePath')
      and (coalesce(jsonb_array_length(payload->'environments'),0)=0 or payload->'environments' ? i.environment_id::text)
  ), filtered as materialized (
    select *, case status when 'open' then 0 when 'in_progress' then 1 when 'validation' then 2 else 3 end status_rank,
      case priority when 'high' then 0 when 'medium' then 1 else 2 end priority_rank
    from scoped i where
      (not(payload ? 'id') or i.id=(payload->>'id')::uuid)
      and (coalesce(jsonb_array_length(payload->'statuses'),0)=0 or payload->'statuses' ? i.status)
      and (coalesce(jsonb_array_length(payload->'priorities'),0)=0 or payload->'priorities' ? i.priority)
      and (coalesce(jsonb_array_length(payload->'pages'),0)=0 or payload->'pages' ? i.page_path)
      and (coalesce(jsonb_array_length(payload->'users'),0)=0 or payload->'users' ? i.author_key or payload->'users' ? i.updated_key)
      and (coalesce(payload->>'search','')='' or position(lower(payload->>'search') in lower(i.body||' '||i.page_path||case when project_scope then '' else ' '||i.author_name end))>0)
  ), ranked as (
    select *, row_number() over(order by
      case when sort_field='status' then status_rank * case sort_direction when 'desc' then -1 else 1 end end,
      case when sort_field='priority' then priority_rank * case sort_direction when 'desc' then -1 else 1 end end,
      case when sort_field='created_at' and sort_direction='asc' then created_at end asc,
      case when sort_field='created_at' and sort_direction='desc' then created_at end desc,
      case when sort_field='updated_at' and sort_direction='asc' then updated_at end asc nulls last,
      case when sort_field='updated_at' and sort_direction='desc' then updated_at end desc nulls last,
      case when sort_direction='asc' then case sort_field when 'body' then public.report_text_sort(body) when 'authorName' then public.report_text_sort(author_name) when 'environment' then public.report_text_sort(environment_name) end end asc,
      case when sort_direction='desc' then case sort_field when 'body' then public.report_text_sort(body) when 'authorName' then public.report_text_sort(author_name) when 'environment' then public.report_text_sort(environment_name) end end desc,
      case when sort_field='environment' and sort_direction='asc' then public.report_text_sort(page_path) end asc,
      case when sort_field='environment' and sort_direction='desc' then public.report_text_sort(page_path) end desc,
      case when sort_field='status' then priority_rank end, created_at asc,id asc) position
    from filtered
  ), batch as (
    select * from ranked order by position limit page_size offset page_offset
  )
  select jsonb_build_object('total',(select count(*) from filtered),
    'projectTotal',(select count(*) from public.issues i where case when project_scope then i.project_id=(a->>'projectId')::uuid else i.environment_id=target end),
    'pages',(select coalesce(jsonb_agg(p.page_path order by p.page_path),'[]'::jsonb) from (select distinct page_path from scoped) p),
    'reports',case when coalesce((payload->>'selectionOnly')::boolean,false) then
      coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'environment_id',f.environment_id,
        'canEdit',coalesce((a->>'manager')::boolean,false) or coalesce(f.author_id=(a->>'userId')::uuid,false),
        'canChangeStatus',a->>'userId' is not null or a->>'guestId' is not null)) from filtered f),'[]'::jsonb)
      else coalesce((select jsonb_agg((to_jsonb(b)-array['environment_name','author_name','author_key','updated_name','updated_key','status_rank','priority_rank','position']) ||
      jsonb_build_object('authorName',b.author_name,'authorKey',b.author_key,'updatedByName',b.updated_name,'updatedByKey',b.updated_key,
        'canEdit',coalesce((a->>'manager')::boolean,false) or coalesce(b.author_id=(a->>'userId')::uuid,false),
        'canChangeStatus',a->>'userId' is not null or a->>'guestId' is not null,
        'commentCount',(select count(*) from public.comments c where c.issue_id=b.id)) order by b.position) from batch b),'[]'::jsonb) end) into result;
  return result;
end;
$$;
revoke all on function public.report_page(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.report_page(text,uuid,jsonb) to anon,authenticated;

-- Pin previews are lightweight metadata, independent of paginated full reports.
create or replace function public.report_pins(secret text, target uuid, payload jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.report_actor(secret,target);
  if coalesce(payload->>'pagePath','')='' then raise exception 'Page required' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'environment_id',i.environment_id,'page_path',i.page_path,
    'status',i.status,'priority',i.priority,'body',left(i.body,240),'authorName',coalesce(g.display_name,u.email,'Utente'),
    'context',jsonb_build_object('anchor',i.context->'anchor','scroll',i.context->'scroll')) order by i.created_at,i.id),'[]'::jsonb)
    from public.issues i left join public.guest_sessions g on g.id=i.guest_session_id left join auth.users u on u.id=i.author_id
    where i.environment_id=target and i.page_path=payload->>'pagePath');
end;
$$;
revoke all on function public.report_pins(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.report_pins(text,uuid,jsonb) to anon,authenticated;
