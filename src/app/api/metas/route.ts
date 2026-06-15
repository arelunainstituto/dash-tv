import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { pedidoAutenticado } from "@/lib/sessao";
import {
  METRICAS,
  METRICAS_EDITAVEIS,
  valoresZerados,
  type Valores,
} from "@/lib/metricas";
import { diasUteisDoMes } from "@/lib/datas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MES_VALIDO = /^\d{4}-\d{2}$/;

interface LinhaMetas {
  vendedor_id: string;
  mensal: Valores;
  diaria: Valores;
}

function erroTabela(mensagem: string) {
  return mensagem.includes("metas_vendedores")
    ? "Tabela de metas por vendedor não existe — execute supabase/migrations/0004_metas_vendedores.sql no SQL Editor do Supabase."
    : mensagem;
}

// Metas de um mês, por vendedor: GET /api/metas?mes=YYYY-MM
export async function GET(request: NextRequest) {
  if (!(await pedidoAutenticado(request))) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  const mes = request.nextUrl.searchParams.get("mes") ?? "";
  if (!MES_VALIDO.test(mes)) {
    return NextResponse.json({ erro: "Mês inválido" }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data, error } = await supabase
    .from("metas_vendedores")
    .select("*")
    .eq("mes", `${mes}-01`);

  if (error) {
    return NextResponse.json({ erro: erroTabela(error.message) }, { status: 500 });
  }

  const linhas: LinhaMetas[] = (data ?? []).map(
    (r: Record<string, unknown>) => {
      const mensal = valoresZerados();
      const diaria = valoresZerados();
      for (const m of METRICAS) {
        mensal[m.chave] = Number(r[m.chave] ?? 0);
        diaria[m.chave] = Number(r[`${m.chave}_dia`] ?? 0);
      }
      return { vendedor_id: String(r.vendedor_id), mensal, diaria };
    }
  );
  return NextResponse.json({ linhas });
}

// Grava as metas do mês (upsert por vendedor). Só a meta DIÁRIA é digitada;
// a mensal é calculada: diária × dias úteis do mês (sáb/dom/feriados fora).
// POST /api/metas { mes: "YYYY-MM", linhas: [{vendedor_id, diaria}] }
export async function POST(request: NextRequest) {
  if (!(await pedidoAutenticado(request))) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }

  const corpo = (await request.json().catch(() => null)) as {
    mes?: unknown;
    linhas?: unknown;
  } | null;
  if (!corpo || typeof corpo.mes !== "string" || !MES_VALIDO.test(corpo.mes)) {
    return NextResponse.json({ erro: "Mês inválido" }, { status: 400 });
  }
  const linhas = corpo.linhas;
  if (!Array.isArray(linhas) || linhas.length === 0 || linhas.length > 100) {
    return NextResponse.json({ erro: "Linhas inválidas" }, { status: 400 });
  }

  const diasUteis = diasUteisDoMes(corpo.mes);
  const registos: Record<string, string | number>[] = [];
  for (const linha of linhas as {
    vendedor_id?: unknown;
    diaria?: Record<string, unknown>;
  }[]) {
    if (typeof linha.vendedor_id !== "string") {
      return NextResponse.json({ erro: "vendedor_id inválido" }, { status: 400 });
    }
    const registo: Record<string, string | number> = {
      vendedor_id: linha.vendedor_id,
      mes: `${corpo.mes}-01`,
    };
    for (const m of METRICAS_EDITAVEIS) {
      const vDia = linha.diaria?.[m.chave];
      if (
        typeof vDia !== "number" ||
        !Number.isFinite(vDia) ||
        vDia < 0 ||
        (m.tipo === "int" && !Number.isInteger(vDia))
      ) {
        return NextResponse.json(
          { erro: `Valor inválido em ${m.rotulo}` },
          { status: 400 }
        );
      }
      registo[`${m.chave}_dia`] = vDia;
      // Métrica inteira (contagem): meta do mês é inteira; € mantém 2 casas.
      registo[m.chave] =
        m.tipo === "int"
          ? vDia * diasUteis
          : Math.round(vDia * diasUteis * 100) / 100;
    }
    registos.push(registo);
  }

  const supabase = criarClienteAdmin();
  const { error } = await supabase
    .from("metas_vendedores")
    .upsert(registos, { onConflict: "vendedor_id,mes" });

  if (error) {
    return NextResponse.json({ erro: erroTabela(error.message) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
