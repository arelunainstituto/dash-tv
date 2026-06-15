import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { limparLinhasDia } from "@/lib/lancamentos";
import { hojeLisboa } from "@/lib/datas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gravação pública (sem login) do dia confirmado a partir do /upload-quadro.
// Só faz upsert em lancamentos_diarios — nunca toca nas metas.
// POST { data: "YYYY-MM-DD", linhas: [{ vendedor_id, ...métricas }] }
export async function POST(request: NextRequest) {
  const corpo = (await request.json().catch(() => null)) as {
    data?: unknown;
    linhas?: unknown;
  } | null;

  const data = corpo?.data;
  const linhas = corpo?.linhas;
  if (typeof data !== "string") {
    return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
  }
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return NextResponse.json({ erro: "Sem linhas para guardar" }, { status: 400 });
  }

  // A data vem uma vez para o lote inteiro; injeta em cada linha para validar.
  const comData = (linhas as Record<string, unknown>[]).map((l) => ({
    ...l,
    data,
  }));
  const { limpas, erro } = limparLinhasDia(comData, hojeLisboa());
  if (erro || !limpas) {
    return NextResponse.json({ erro: erro ?? "Linhas inválidas" }, { status: 400 });
  }

  const supabase = criarClienteAdmin();

  // Defesa: só aceita vendedor_id de vendedor ativo existente.
  const { data: vendedores, error: erroVend } = await supabase
    .from("vendedores")
    .select("id")
    .eq("ativo", true);
  if (erroVend) {
    return NextResponse.json({ erro: erroVend.message }, { status: 500 });
  }
  const idsValidos = new Set((vendedores ?? []).map((v) => v.id));
  for (const linha of limpas) {
    if (!idsValidos.has(linha.vendedor_id)) {
      return NextResponse.json(
        { erro: "Vendedor desconhecido na linha." },
        { status: 400 }
      );
    }
  }

  const { error } = await supabase
    .from("lancamentos_diarios")
    .upsert(limpas, { onConflict: "vendedor_id,data" });
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, guardadas: limpas.length });
}
