-- 0004_metas_vendedores.sql — metas POR VENDEDOR, mensais e diárias.
-- Uma linha por vendedor por mês: colunas sem sufixo = meta do mês inteiro;
-- colunas com sufixo _dia = meta de cada dia.
-- A meta da equipa passa a ser a soma das metas dos vendedores
-- (a tabela metas_mensais fica como fallback enquanto esta estiver vazia).
-- Executar no Supabase Dashboard → SQL Editor.

create table public.metas_vendedores (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.vendedores(id) on delete cascade,
  mes date not null, -- primeiro dia do mês, ex.: 2026-06-01

  -- metas do mês
  leads_contatados integer not null default 0 check (leads_contatados >= 0),
  video_agendadas integer not null default 0 check (video_agendadas >= 0),
  video_realizadas integer not null default 0 check (video_realizadas >= 0),
  sinal_recebido numeric(12,2) not null default 0 check (sinal_recebido >= 0),
  vendas_presencial numeric(12,2) not null default 0 check (vendas_presencial >= 0),
  valor_em_caixa numeric(12,2) not null default 0 check (valor_em_caixa >= 0),

  -- metas por dia
  leads_contatados_dia integer not null default 0 check (leads_contatados_dia >= 0),
  video_agendadas_dia integer not null default 0 check (video_agendadas_dia >= 0),
  video_realizadas_dia integer not null default 0 check (video_realizadas_dia >= 0),
  sinal_recebido_dia numeric(12,2) not null default 0 check (sinal_recebido_dia >= 0),
  vendas_presencial_dia numeric(12,2) not null default 0 check (vendas_presencial_dia >= 0),
  valor_em_caixa_dia numeric(12,2) not null default 0 check (valor_em_caixa_dia >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendedor_id, mes)
);

create trigger trg_metas_vendedores_updated_at
  before update on public.metas_vendedores
  for each row execute function public.set_updated_at();

-- RLS ativo e sem políticas = só o service role acessa (a app edita via /admin/metas)
alter table public.metas_vendedores enable row level security;
