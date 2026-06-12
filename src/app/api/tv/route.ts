import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  METRICAS,
  valoresZerados,
  type Lancamento,
  type Valores,
  type Vendedor,
} from "@/lib/metricas";
import { hojeLisboa, inicioDoMes, nomeDoMes } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEM_CACHE = { "Cache-Control": "no-store" };

function tokenValido(recebido: string | null): boolean {
  const esperado = process.env.TV_TOKEN;
  if (!recebido || !esperado) return false;
  // Hash de ambos antes de comparar para o timingSafeEqual aceitar
  // comprimentos diferentes sem vazar o tamanho do token.
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export interface LinhaTv {
  nome: string;
  mes: Valores;
  hoje: Valores;
}

export async function GET(request: NextRequest) {
  if (!tokenValido(request.nextUrl.searchParams.get("token"))) {
    return NextResponse.json(
      { erro: "Token inválido" },
      { status: 401, headers: SEM_CACHE }
    );
  }

  const hoje = hojeLisboa();
  const inicio = inicioDoMes(hoje);
  const supabase = criarClienteAdmin();

  const [vend, lanc] = await Promise.all([
    supabase
      .from("vendedores")
      .select("id, nome, ativo, ordem")
      .order("ordem")
      .order("nome"),
    supabase
      .from("lancamentos_diarios")
      .select("*")
      .gte("data", inicio)
      .lte("data", hoje),
  ]);

  if (vend.error || lanc.error) {
    return NextResponse.json(
      { erro: vend.error?.message ?? lanc.error?.message },
      { status: 500, headers: SEM_CACHE }
    );
  }

  const somasMes = new Map<string, Valores>();
  const somasHoje = new Map<string, Valores>();
  for (const linha of (lanc.data ?? []) as Lancamento[]) {
    const mes = somasMes.get(linha.vendedor_id) ?? valoresZerados();
    for (const m of METRICAS) mes[m.chave] += linha[m.chave];
    somasMes.set(linha.vendedor_id, mes);
    if (linha.data === hoje) {
      somasHoje.set(linha.vendedor_id, {
        ...valoresZerados(),
        ...Object.fromEntries(METRICAS.map((m) => [m.chave, linha[m.chave]])),
      });
    }
  }

  // Aparece quem está ativo OU teve movimento no mês — um vendedor
  // desativado a meio do mês continua no painel até virar o mês.
  const vendedores: LinhaTv[] = ((vend.data ?? []) as Vendedor[])
    .filter((v) => {
      const s = somasMes.get(v.id);
      return v.ativo || (s && METRICAS.some((m) => s[m.chave] > 0));
    })
    .map((v) => ({
      nome: v.nome,
      mes: somasMes.get(v.id) ?? valoresZerados(),
      hoje: somasHoje.get(v.id) ?? valoresZerados(),
    }));

  const totais = { mes: valoresZerados(), hoje: valoresZerados() };
  for (const v of vendedores) {
    for (const m of METRICAS) {
      totais.mes[m.chave] += v.mes[m.chave];
      totais.hoje[m.chave] += v.hoje[m.chave];
    }
  }

  return NextResponse.json(
    {
      mes: nomeDoMes(hoje),
      hoje,
      atualizadoEm: new Date().toISOString(),
      vendedores,
      totais,
    },
    { headers: SEM_CACHE }
  );
}
