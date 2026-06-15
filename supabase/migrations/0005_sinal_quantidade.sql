-- 0005_sinal_quantidade.sql — "Sinal Recebido" deixa de ser valor (€) e passa
-- a ser QUANTIDADE (contagem inteira); o "Valor em Caixa" é removido de vez.
-- Executar no Supabase Dashboard → SQL Editor, depois das migrações 0001–0004.
-- NOTA: os valores antigos de sinal (em €) são arredondados para inteiro — como
-- a métrica mudou de significado, reveja/reintroduza as quantidades reais.

-- lançamentos diários
alter table public.lancamentos_diarios drop column if exists valor_em_caixa;
alter table public.lancamentos_diarios
  alter column sinal_recebido drop default,
  alter column sinal_recebido type integer using round(sinal_recebido)::integer,
  alter column sinal_recebido set default 0;

-- metas por vendedor (mensal + diária)
alter table public.metas_vendedores drop column if exists valor_em_caixa;
alter table public.metas_vendedores drop column if exists valor_em_caixa_dia;
alter table public.metas_vendedores
  alter column sinal_recebido drop default,
  alter column sinal_recebido type integer using round(sinal_recebido)::integer,
  alter column sinal_recebido set default 0,
  alter column sinal_recebido_dia drop default,
  alter column sinal_recebido_dia type integer using round(sinal_recebido_dia)::integer,
  alter column sinal_recebido_dia set default 0;

-- metas mensais da equipa (fallback)
alter table public.metas_mensais drop column if exists valor_em_caixa;
alter table public.metas_mensais
  alter column sinal_recebido drop default,
  alter column sinal_recebido type integer using round(sinal_recebido)::integer,
  alter column sinal_recebido set default 0;
