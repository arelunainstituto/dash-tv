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
import { addDias, addMeses, hojeLisboa, inicioDoMes, nomeDoMes } from "@/lib/datas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SEM_CACHE = { "Cache-Control": "no-store" };
const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

function tokenValido(recebido: string | null): boolean {
  const esperado = process.env.TV_TOKEN;
  if (!recebido || !esperado) return false;
  // Hash de ambos antes de comparar para o timingSafeEqual aceitar
  // comprimentos diferentes sem vazar o tamanho do token.
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

// GET /api/tv?token=…&de=YYYY-MM-DD&ate=YYYY-MM-DD
// Sem de/ate: período = hoje. Devolve somas do período + valores de hoje.
export async function GET(request: NextRequest) {
  if (!tokenValido(request.nextUrl.searchParams.get("token"))) {
    return NextResponse.json(
      { erro: "Token inválido" },
      { status: 401, headers: SEM_CACHE }
    );
  }

  const hoje = hojeLisboa();
  let de = request.nextUrl.searchParams.get("de") ?? hoje;
  let ate = request.nextUrl.searchParams.get("ate") ?? hoje;
  if (!DATA_VALIDA.test(de)) de = hoje;
  if (!DATA_VALIDA.test(ate)) ate = hoje;
  if (de > ate) [de, ate] = [ate, de];

  const supabase = criarClienteAdmin();
  const [vend, lanc, lancHoje] = await Promise.all([
    supabase
      .from("vendedores")
      .select("id, nome, ativo, ordem")
      .order("ordem")
      .order("nome"),
    supabase
      .from("lancamentos_diarios")
      .select("*")
      .gte("data", de)
      .lte("data", ate),
    supabase.from("lancamentos_diarios").select("*").eq("data", hoje),
  ]);

  if (vend.error || lanc.error || lancHoje.error) {
    return NextResponse.json(
      {
        erro:
          vend.error?.message ??
          lanc.error?.message ??
          lancHoje.error?.message,
      },
      { status: 500, headers: SEM_CACHE }
    );
  }

  const somasPeriodo = new Map<string, Valores>();
  for (const linha of (lanc.data ?? []) as Lancamento[]) {
    const acc = somasPeriodo.get(linha.vendedor_id) ?? valoresZerados();
    for (const m of METRICAS) acc[m.chave] += linha[m.chave];
    somasPeriodo.set(linha.vendedor_id, acc);
  }
  const somasHoje = new Map<string, Valores>();
  for (const linha of (lancHoje.data ?? []) as Lancamento[]) {
    const acc = valoresZerados();
    for (const m of METRICAS) acc[m.chave] = linha[m.chave];
    somasHoje.set(linha.vendedor_id, acc);
  }

  // Metas por vendedor do mês corrente (tabela 0004). Enquanto estiver
  // vazia, a meta mensal da equipa cai para metas_mensais (0003).
  const metaMesPorVendedor = new Map<string, Valores>();
  const metaDiaPorVendedor = new Map<string, Valores>();
  const resMetas = await supabase
    .from("metas_vendedores")
    .select("*")
    .eq("mes", inicioDoMes(hoje));
  if (!resMetas.error) {
    for (const r of (resMetas.data ?? []) as Record<string, unknown>[]) {
      const mensal = valoresZerados();
      const diaria = valoresZerados();
      for (const m of METRICAS) {
        mensal[m.chave] = Number(r[m.chave] ?? 0);
        diaria[m.chave] = Number(r[`${m.chave}_dia`] ?? 0);
      }
      metaMesPorVendedor.set(String(r.vendedor_id), mensal);
      metaDiaPorVendedor.set(String(r.vendedor_id), diaria);
    }
  }

  // Aparece quem está ativo OU teve movimento no período.
  const vendedores = ((vend.data ?? []) as Vendedor[])
    .filter((v) => {
      const s = somasPeriodo.get(v.id);
      return v.ativo || (s && METRICAS.some((m) => s[m.chave] > 0));
    })
    .map((v) => ({
      nome: v.nome,
      periodo: somasPeriodo.get(v.id) ?? valoresZerados(),
      hoje: somasHoje.get(v.id) ?? valoresZerados(),
      metaMes: metaMesPorVendedor.get(v.id) ?? valoresZerados(),
      metaDia: metaDiaPorVendedor.get(v.id) ?? valoresZerados(),
    }));

  const totais = {
    periodo: valoresZerados(),
    hoje: valoresZerados(),
    metaMes: valoresZerados(),
    metaDia: valoresZerados(),
  };
  for (const v of vendedores) {
    for (const m of METRICAS) {
      totais.periodo[m.chave] += v.periodo[m.chave];
      totais.hoje[m.chave] += v.hoje[m.chave];
      totais.metaMes[m.chave] += v.metaMes[m.chave];
      totais.metaDia[m.chave] += v.metaDia[m.chave];
    }
  }

  // Fallback: sem metas por vendedor, usa a meta mensal da equipa (0003).
  if (METRICAS.every((m) => totais.metaMes[m.chave] === 0)) {
    const resEquipa = await supabase
      .from("metas_mensais")
      .select("*")
      .eq("mes", inicioDoMes(hoje))
      .maybeSingle();
    if (!resEquipa.error && resEquipa.data) {
      const equipa = resEquipa.data as unknown as Valores;
      for (const m of METRICAS) totais.metaMes[m.chave] = equipa[m.chave];
    }
  }

  // Comparativo mês a mês do FATURADO (independente do filtro de período):
  // mês atual até hoje vs mês anterior (no mesmo dia e fechado).
  const mesAtualIni = inicioDoMes(hoje);
  const mesAntIni = addMeses(mesAtualIni, -1);
  const fimMesAnt = addDias(mesAtualIni, -1);
  const dia = hoje.slice(8, 10);
  let corteAnt = `${mesAntIni.slice(0, 7)}-${dia}`;
  if (corteAnt > fimMesAnt) corteAnt = fimMesAnt; // mês anterior mais curto

  const cmp = await supabase
    .from("lancamentos_diarios")
    .select("data, vendas_presencial")
    .gte("data", mesAntIni)
    .lte("data", hoje);

  let fatAtual = 0;
  let fatAntAteDia = 0;
  let fatAntMes = 0;
  for (const r of (cmp.data ?? []) as { data: string; vendas_presencial: number }[]) {
    const v = Number(r.vendas_presencial) || 0;
    if (r.data >= mesAtualIni && r.data <= hoje) {
      fatAtual += v;
    } else if (r.data >= mesAntIni && r.data <= fimMesAnt) {
      fatAntMes += v;
      if (r.data <= corteAnt) fatAntAteDia += v;
    }
  }

  const comparativo = {
    diaCorte: Number(dia),
    mesAtualRotulo: nomeDoMes(mesAtualIni),
    mesAntRotulo: nomeDoMes(mesAntIni),
    atual: fatAtual,
    anteriorAteDia: fatAntAteDia,
    anteriorMes: fatAntMes,
  };

  return NextResponse.json(
    {
      de,
      ate,
      hoje,
      mesRotulo: nomeDoMes(hoje),
      atualizadoEm: new Date().toISOString(),
      vendedores,
      totais,
      comparativo,
    },
    { headers: SEM_CACHE }
  );
}
