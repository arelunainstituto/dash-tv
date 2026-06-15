import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { pedidoAutenticado } from "@/lib/sessao";
import { limparLinhasDia } from "@/lib/lancamentos";
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

  const { limpas, erro } = limparLinhasDia(linhas, hojeLisboa());
  if (erro || !limpas) {
    return NextResponse.json({ erro: erro ?? "Linhas inválidas" }, { status: 400 });
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
