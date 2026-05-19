create extension if not exists "pgcrypto";

create table if not exists public.users_profile (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin', 'support')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'mock',
  provider_customer_key text,
  provider_subscription_id text,
  plan text not null default 'free' check (plan in ('free','pro','team','enterprise')),
  status text not null default 'active' check (status in ('active','past_due','canceled','trialing','incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_limits (
  id uuid primary key default gen_random_uuid(),
  plan text not null unique check (plan in ('free','pro','team','enterprise')),
  monthly_jobs integer not null,
  monthly_pages integer not null,
  monthly_storage_mb integer not null,
  monthly_ai_tokens integer not null,
  max_file_size_mb integer not null
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,
  original_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  page_count integer,
  file_kind text not null check (file_kind in ('source','output','template','preview')),
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete set null,
  source_file_id uuid references public.files(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','queued','processing','reviewing','completed','failed','canceled')),
  job_type text not null check (job_type in ('problem_extraction','template_generation','pdf_generation')),
  progress integer not null default 0 check (progress between 0 and 100),
  error_message text,
  options jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  usage_type text not null,
  pages_count integer default 0,
  tokens_used integer default 0,
  storage_mb numeric default 0,
  cost_usd numeric default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.extracted_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  source_file_id uuid references public.files(id) on delete set null,
  source_page integer,
  item_type text not null check (item_type in ('problem','explanation','passage','solution','other')),
  content_text text not null default '',
  content_html text,
  math_latex text,
  image_paths jsonb not null default '[]'::jsonb,
  subject text,
  unit text,
  difficulty text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  category text not null,
  template_html text not null,
  template_css text,
  preview_image_url text,
  is_public boolean not null default false,
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outputs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  template_id uuid references public.templates(id) on delete set null,
  output_type text not null check (output_type in ('html','pdf','pptx')),
  file_id uuid references public.files(id) on delete set null,
  preview_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  level text not null check (level in ('debug','info','warning','error','critical')),
  message text not null,
  stack text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_workspace_members_user on public.workspace_members(user_id);
create index if not exists idx_files_workspace on public.files(workspace_id, created_at desc);
create index if not exists idx_jobs_workspace_status on public.jobs(workspace_id, status, created_at desc);
create index if not exists idx_extracted_items_workspace on public.extracted_items(workspace_id, created_at desc);
create index if not exists idx_templates_public on public.templates(is_public, category);
create index if not exists idx_usage_logs_workspace_created on public.usage_logs(workspace_id, created_at desc);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id
      and user_id = auth.uid()
      and role in ('owner','admin')
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users_profile
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users_profile (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.users_profile enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_limits enable row level security;
alter table public.files enable row level security;
alter table public.jobs enable row level security;
alter table public.usage_logs enable row level security;
alter table public.extracted_items enable row level security;
alter table public.templates enable row level security;
alter table public.outputs enable row level security;
alter table public.audit_logs enable row level security;
alter table public.error_logs enable row level security;

create policy "profile_self_or_admin" on public.users_profile for select using (id = auth.uid() or public.is_platform_admin());
create policy "profile_update_self" on public.users_profile for update using (id = auth.uid()) with check (id = auth.uid());

create policy "workspaces_member_select" on public.workspaces for select using (public.is_workspace_member(id) or public.is_platform_admin());
create policy "workspaces_owner_insert" on public.workspaces for insert with check (owner_id = auth.uid());
create policy "workspaces_admin_update" on public.workspaces for update using (public.is_workspace_admin(id) or public.is_platform_admin());

create policy "members_select" on public.workspace_members for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "members_admin_write" on public.workspace_members for all using (public.is_workspace_admin(workspace_id) or public.is_platform_admin()) with check (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create policy "subscriptions_member_select" on public.subscriptions for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "subscriptions_admin_write" on public.subscriptions for all using (public.is_workspace_admin(workspace_id) or public.is_platform_admin()) with check (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create policy "usage_limits_public_read" on public.usage_limits for select using (true);

create policy "files_member_select" on public.files for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "files_member_insert" on public.files for insert with check (public.is_workspace_member(workspace_id));
create policy "files_admin_delete" on public.files for delete using (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create policy "jobs_member_select" on public.jobs for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "jobs_member_insert" on public.jobs for insert with check (public.is_workspace_member(workspace_id));
create policy "jobs_member_update" on public.jobs for update using (public.is_workspace_member(workspace_id) or public.is_platform_admin()) with check (public.is_workspace_member(workspace_id) or public.is_platform_admin());

create policy "usage_member_select" on public.usage_logs for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "usage_service_insert" on public.usage_logs for insert with check (public.is_workspace_member(workspace_id) or public.is_platform_admin());

create policy "items_member_select" on public.extracted_items for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "items_member_write" on public.extracted_items for all using (public.is_workspace_member(workspace_id) or public.is_platform_admin()) with check (public.is_workspace_member(workspace_id) or public.is_platform_admin());

create policy "templates_read_public_or_member" on public.templates for select using (is_public or is_system or public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "templates_member_write" on public.templates for all using (workspace_id is not null and public.is_workspace_member(workspace_id)) with check (workspace_id is not null and public.is_workspace_member(workspace_id));

create policy "outputs_member_select" on public.outputs for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "outputs_member_write" on public.outputs for all using (public.is_workspace_member(workspace_id) or public.is_platform_admin()) with check (public.is_workspace_member(workspace_id) or public.is_platform_admin());

create policy "audit_member_select" on public.audit_logs for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "audit_member_insert" on public.audit_logs for insert with check (public.is_workspace_member(workspace_id) or public.is_platform_admin());

create policy "errors_admin_or_member_select" on public.error_logs for select using (public.is_workspace_member(workspace_id) or public.is_platform_admin());
create policy "errors_insert" on public.error_logs for insert with check (workspace_id is null or public.is_workspace_member(workspace_id) or public.is_platform_admin());
