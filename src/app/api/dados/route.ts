import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { pedidoAutenticado } from "@/lib/sessao";
import { METRICAS_EDITAVEIS } from "@/lib/metricas";
import { hojeLisboa } from "@/lib/datas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

// Lançamentos de um dia: GET /api/dados?data=YYYY-MM-DD
export async function GET(request: NextRequest) {
  if (!(await pedidoAutenticado(request))) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  const data = request.nextUrl.searchParams.get("data") ?? "";
  if (!DATA_VALIDA.test(data)) {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data: lancamentos, error } = await supabase
    .from("lancamentos_diarios")
    .select("*")
    .eq("data", data);

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ lancamentos });
}

// Grava o dia inteiro (upsert): POST /api/dados { linhas: [...] }
export async function POST(request: NextRequest) {
  if (!(await pedidoAutenticado(request))) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const linhas = (corpo as { linhas?: unknown })?.linhas;
  if (!Array.isArray(linhas) || linhas.length === 0 || linhas.length > 100) {
    return NextResponse.json({ erro: "Linhas inválidas" }, { status: 400 });
  }

  const hoje = hojeLisboa();
  const limpas: Record<string, string | number>[] = [];
  for (const linha of linhas as Record<string, unknown>[]) {
    if (typeof linha.vendedor_id !== "string") {
      return NextResponse.json({ erro: "vendedor_id inválido" }, { status: 400 });
    }
    if (typeof linha.data !== "string" || !DATA_VALIDA.test(linha.data) || linha.data > hoje) {
      return NextResponse.json({ erro: "Data inválida ou no futuro" }, { status: 400 });
    }
    const limpa: Record<string, string | number> = {
      vendedor_id: linha.vendedor_id,
      data: linha.data,
    };
    for (const m of METRICAS_EDITAVEIS) {
      const v = linha[m.chave];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        return NextResponse.json({ erro: `Valor inválido em ${m.rotulo}` }, { status: 400 });
      }
      limpa[m.chave] = v;
    }
    // Valor em Caixa é sempre calculado: Sinal + Vendas
    limpa.valor_em_caixa =
      Number(limpa.sinal_recebido) + Number(limpa.vendas_presencial);
    limpas.push(limpa);
  }

  const supabase = criarClienteAdmin();
  const { error } = await supabase
    .from("lancamentos_diarios")
    .upsert(limpas, { onConflict: "vendedor_id,data" });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
