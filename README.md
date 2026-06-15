# Relatório Comercial

Painel comercial com três telas:

- **`/admin`** — tela de edição (com login): lançamento manual dos números diários de cada vendedor.
- **`/tv?token=…`** — tela de visualização para a TV da sala (sem login, somente leitura): acumulado do mês + valores de hoje, auto-atualizada a cada 45 s.
- **`/upload-quadro`** — tela pública (sem login): tira/sobe a foto do quadro branco, a IA (OpenAI Vision) lê os números e mostra uma grade editável; só grava o dia depois do **Confirmar**. Atualiza apenas os resultados diários (nunca as metas).

Colunas: Leads Contatados, Vídeo Agendadas, Vídeo Realizadas, Sinal Recebido (quantidades) · Vendas Presencial (valor em €).

Stack: Next.js (App Router) + Tailwind + Supabase (Postgres + Auth), deploy na Vercel.

## Configuração inicial (uma vez)

### 1. Base de dados

No [Supabase Dashboard](https://supabase.com/dashboard) (projeto OMILUNER) → **SQL Editor** → colar e executar, por ordem:

1. [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — tabelas `vendedores` e `lancamentos_diarios`, RLS e os 6 vendedores iniciais.
2. [`supabase/migrations/0002_so_admin.sql`](supabase/migrations/0002_so_admin.sql) — **importante**: fecha o acesso direto ao banco (a app acessa tudo pelo servidor com a service role; nenhum outro caminho fica aberto).
3. [`supabase/migrations/0003_metas.sql`](supabase/migrations/0003_metas.sql) — metas mensais da equipa (usada como fallback).
4. [`supabase/migrations/0004_metas_vendedores.sql`](supabase/migrations/0004_metas_vendedores.sql) — metas por vendedor, mensais e diárias (a meta da equipa = soma dos vendedores).
5. [`supabase/migrations/0005_sinal_quantidade.sql`](supabase/migrations/0005_sinal_quantidade.sql) — "Sinal Recebido" passa a quantidade (inteiro) e remove o "Valor em Caixa".

### 2. Login do admin

Sem cadastro, sem Supabase Auth: o usuário e a senha ficam no `.env.local` (`ADMIN_USER` / `ADMIN_PASSWORD`). Para trocar a senha, edite a variável e reinicie (ou redeploy na Vercel) — todas as sessões antigas caem automaticamente.

### 3. Variáveis de ambiente

Copiar `.env.example` para `.env.local` e preencher. O `TV_TOKEN` é o segredo do link da TV — gerar com `openssl rand -hex 24`. O `OPENAI_API_KEY` (server-only) alimenta a leitura da foto em `/upload-quadro`; opcional `OPENAI_MODEL` (padrão `gpt-4o`).

### 4. Rodar localmente

```bash
npm install
npm run dev   # http://localhost:3000
```

### 5. Deploy na Vercel

```bash
npx vercel          # login interativo na primeira vez
npx vercel --prod
```

No dashboard da Vercel → Settings → Environment Variables, configurar as mesmas 5 variáveis do `.env.local`. (Opcional: conectar um repositório GitHub para deploy automático a cada push.)

### 6. Configurar a TV

1. Abrir `https://<app>.vercel.app/tv?token=<TV_TOKEN>` no browser da TV.
2. Colocar em ecrã inteiro (F11 ou modo kiosk — ex.: Fully Kiosk em Android TV).
3. Desativar protetor de ecrã / suspensão automática do dispositivo.
4. Guardar o link como favorito/página inicial.

O painel mantém os últimos dados se a ligação cair (aviso "Sem ligação" após 3 min), vira o mês automaticamente e recarrega-se às 04:00.

## Operação

- **Lançar o dia**: `/admin` → preencher a grade → Guardar. Campos vazios contam como 0. Enter avança de campo; Ctrl/Cmd+S guarda.
- **Corrigir um dia anterior**: navegar até à data, editar, guardar de novo (sobrescreve).
- **Conferir o mês**: `/admin/resumo` mostra exatamente os acumulados que aparecem na TV.
- **Vendedores**: `/admin/vendedores` — renomear, adicionar, reordenar, ativar/desativar. Não há exclusão: desative. Inativos saem da grade; ficam no painel enquanto tiverem movimento no mês.
- **Metas**: `/admin/metas` — por vendedor, com meta do mês e meta diária para cada métrica. No painel: modo Hoje usa a meta diária, modo Mês a mensal, Semana/datas livres usam a diária × nº de dias; o ranking mostra o % da meta de vendas de cada vendedor.
- **Trocar o token da TV** (se o link vazar): mudar `TV_TOKEN` na Vercel → Redeploy → atualizar o favorito da TV. O link antigo passa a mostrar "Acesso inválido".
- **Trocar a senha do admin**: editar `ADMIN_PASSWORD` no `.env.local` (local) ou na Vercel (produção) e reiniciar/redeploy.

## Estrutura

| Caminho | Função |
| --- | --- |
| `src/app/admin/` | Telas de edição (diário, resumo, vendedores) |
| `src/app/tv/` + `src/components/TvBoard.tsx` | Painel da TV |
| `src/app/api/tv/route.ts` | Endpoint da TV (valida o token, usa service role no servidor) |
| `src/lib/metricas.ts` | **Fonte única das métricas/colunas** — para adicionar uma coluna: `alter table` + entrada aqui |
| `src/lib/datas.ts` | Datas no fuso Europe/Lisbon |
| `src/lib/formato.ts` | Formatação/parsing pt-PT (€) |
| `src/proxy.ts` | Proteção de rota `/admin*` |
| `supabase/migrations/` | Schema SQL |

## Fora do escopo (ideias para v2)

Integração automática com Zoho CRM (o upsert diário já tem o formato pronto para um job externo escrever as mesmas linhas), metas por vendedor com barras de progresso, gráficos de evolução, exportação CSV/PDF, múltiplos usuários/perfis, Realtime em vez de polling.
