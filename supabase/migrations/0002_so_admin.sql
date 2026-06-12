-- 0002_so_admin.sql — fecha o acesso direto ao banco.
-- A aplicação acessa os dados exclusivamente pelo servidor (service role);
-- nenhum cliente externo precisa de acesso. Remover as políticas
-- 'authenticated' elimina qualquer caminho via API pública do Supabase.
-- Executar no Supabase Dashboard → SQL Editor.

drop policy if exists vendedores_select on public.vendedores;
drop policy if exists vendedores_insert on public.vendedores;
drop policy if exists vendedores_update on public.vendedores;
drop policy if exists lancamentos_select on public.lancamentos_diarios;
drop policy if exists lancamentos_insert on public.lancamentos_diarios;
drop policy if exists lancamentos_update on public.lancamentos_diarios;

-- RLS continua ativo e sem políticas = só o service role acessa.
