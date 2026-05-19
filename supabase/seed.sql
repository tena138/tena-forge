insert into public.usage_limits (plan, monthly_jobs, monthly_pages, monthly_storage_mb, monthly_ai_tokens, max_file_size_mb)
values
  ('free', 3, 30, 100, 100000, 20),
  ('pro', 100, 1000, 5120, 5000000, 100),
  ('team', 500, 10000, 51200, 30000000, 300),
  ('enterprise', 10000, 500000, 1024000, 500000000, 2000)
on conflict (plan) do update set
  monthly_jobs = excluded.monthly_jobs,
  monthly_pages = excluded.monthly_pages,
  monthly_storage_mb = excluded.monthly_storage_mb,
  monthly_ai_tokens = excluded.monthly_ai_tokens,
  max_file_size_mb = excluded.max_file_size_mb;

insert into public.templates (name, description, category, template_html, template_css, is_public, is_system)
values
  (
    'Minimal A4 Problem Sheet',
    'A clean print-ready A4 worksheet for archived problems.',
    'worksheet',
    '<main class="page"><header><p>{{workspace_name}}</p><h1>{{document_title}}</h1></header>{{items}}</main>',
    '@page{size:A4;margin:0}.page{width:794px;min-height:1123px;padding:56px;background:white;color:#111827;font-family:Pretendard,"Noto Sans KR",sans-serif}h1{font-size:28px;border-bottom:2px solid #111827;padding-bottom:18px}',
    true,
    true
  ),
  (
    'Premium Academy Worksheet',
    'Premium editorial worksheet layout for academies.',
    'worksheet',
    '<main class="page premium"><header><span>{{workspace_name}}</span><h1>{{document_title}}</h1></header>{{items}}</main>',
    '@page{size:A4;margin:0}.page{width:794px;min-height:1123px;padding:56px;background:#fbfbfd;color:#111827;font-family:Pretendard,"Noto Sans KR",sans-serif}.premium header{border:1px solid #e5e7eb;border-radius:18px;padding:22px;margin-bottom:30px}',
    true,
    true
  )
on conflict do nothing;
