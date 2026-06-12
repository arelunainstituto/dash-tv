-- 0001_init.sql — Relatório Comercial (schema inicial)
-- Executar uma vez no Supabase Dashboard → SQL Editor (projeto OMILUNER)

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table public.vendedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_vendedores_updated_at before update on public.vendedores
  for each row execute function public.set_updated_at();

create table public.lancamentos_diarios (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null references public.vendedores(id) on delete restrict,
  data date not null,
  leads_contatados integer not null default 0 check (leads_contatados >= 0),
  video_agendadas integer not null default 0 check (video_agendadas >= 0),
  video_realizadas integer not null default 0 check (video_realizadas >= 0),
  sinal_recebido numeric(12,2) not null default 0 check (sinal_recebido >= 0),
  vendas_presencial numeric(12,2) not null default 0 check (vendas_presencial >= 0),
  valor_em_caixa numeric(12,2) not null default 0 check (valor_em_caixa >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendedor_id, data)
);
create index idx_lancamentos_data on public.lancamentos_diarios (data);
create trigger trg_lancamentos_updated_at before update on public.lancamentos_diarios
  for each row execute function public.set_updated_at();

alter table public.vendedores enable row level security;
alter table public.lancamentos_diarios enable row level security;

-- authenticated: select/insert/update (SEM delete — corrige-se sobrescrevendo;
-- vendedor desativa-se, não se apaga).
-- anon: nenhuma política = nenhum acesso. A TV usa service role no servidor.
create policy vendedores_select on public.vendedores
  for select to authenticated using (true);
create policy vendedores_insert on public.vendedores
  for insert to authenticated with check (true);
create policy vendedores_update on public.vendedores
  for update to authenticated using (true) with check (true);
create policy lancamentos_select on public.lancamentos_diarios
  for select to authenticated using (true);
create policy lancamentos_insert on public.lancamentos_diarios
  for insert to authenticated with check (true);
create policy lancamentos_update on public.lancamentos_diarios
  for update to authenticated using (true) with check (true);

insert into public.vendedores (nome, ordem) values
  ('Breno Moreira', 10),
  ('Felipe Valentin', 20),
  ('Sofia Falcato', 30),
  ('Susana Crista', 40),
  ('Talita Alves', 50),
  ('Vanessa Rodrigues', 60);
