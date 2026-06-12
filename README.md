# Relatório Comercial

Painel comercial com duas telas:

- **`/admin`** — tela de edição (com login): lançamento manual dos números diários de cada vendedor.
- **`/tv?token=…`** — tela de visualização para a TV da sala (sem login, somente leitura): acumulado do mês + valores de hoje, auto-atualizada a cada 45 s.

Colunas: Leads Contatados, Vídeo Agendadas, Vídeo Realizadas (quantidades) · Sinal Recebido, Vendas Presencial, Valor em Caixa (valores em €).

Stack: Next.js (App Router) + Tailwind + Supabase (Postgres + Auth), deploy na Vercel.

## Configuração inicial (uma vez)

### 1. Base de dados

No [Supabase Dashboard](https://supabase.com/dashboard) (projeto OMILUNER) → **SQL Editor** → colar e executar o conteúdo de [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Isto cria as tabelas `vendedores` e `lancamentos_diarios`, as políticas RLS e os 6 vendedores iniciais.

### 2. Usuário admin

- **Authentication → Users → Add user**: email + senha do admin (marcar *Auto Confirm User*).
- **Authentication → Sign In / Providers**: **desativar "Allow new users to sign up"** — crítico: sem isto, qualquer pessoa poderia se registrar e passar nas políticas RLS.

### 3. Variáveis de ambiente

Copiar `.env.example` para `.env.local` e preencher. O `TV_TOKEN` é o segredo do link da TV — gerar com `openssl rand -hex 24`.

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

No dashboard da Vercel → Settings → Environment Variables, configurar as mesmas 4 variáveis do `.env.local`. (Opcional: conectar um repositório GitHub para deploy automático a cada push.)

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
- **Trocar o token da TV** (se o link vazar): mudar `TV_TOKEN` na Vercel → Redeploy → atualizar o favorito da TV. O link antigo passa a mostrar "Acesso inválido".
- **Reset de senha do admin**: Supabase Dashboard → Authentication → Users.

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
