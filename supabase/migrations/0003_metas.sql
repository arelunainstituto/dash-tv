-- 0003_metas.sql — metas mensais da equipa (uma linha por mês).
-- Alimenta as barras de progresso e a projeção no painel da TV.
-- Executar no Supabase Dashboard → SQL Editor.

create table public.metas_mensais (
  mes date primary key, -- primeiro dia do mês, ex.: 2026-06-01
  leads_contatados integer not null default 0 check (leads_contatados >= 0),
  video_agendadas integer not null default 0 check (video_agendadas >= 0),
  video_realizadas integer not null default 0 check (video_realizadas >= 0),
  sinal_recebido numeric(12,2) not null default 0 check (sinal_recebido >= 0),
  vendas_presencial numeric(12,2) not null default 0 check (vendas_presencial >= 0),
  valor_em_caixa numeric(12,2) not null default 0 check (valor_em_caixa >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_metas_updated_at before update on public.metas_mensais
  for each row execute function public.set_updated_at();

-- RLS ativo e sem políticas = só o service role acessa (a app edita via /admin/metas)
alter table public.metas_mensais enable row level security;
