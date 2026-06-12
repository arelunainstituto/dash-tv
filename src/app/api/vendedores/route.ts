import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { pedidoAutenticado } from "@/lib/sessao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista todos os vendedores
export async function GET(request: NextRequest) {
  if (!(await pedidoAutenticado(request))) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  const supabase = criarClienteAdmin();
  const { data: vendedores, error } = await supabase
    .from("vendedores")
    .select("id, nome, ativo, ordem")
    .order("ordem")
    .order("nome");
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ vendedores });
}

// Adiciona vendedor: POST { nome }
export async function POST(request: NextRequest) {
  if (!(await pedidoAutenticado(request))) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  const corpo = await request.json().catch(() => null);
  const nome = String((corpo as { nome?: unknown })?.nome ?? "").trim();
  if (!nome) {
    return NextResponse.json({ erro: "Nome obrigatório" }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { data: ultimo } = await supabase
    .from("vendedores")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1);
  const ordem = (ultimo?.[0]?.ordem ?? 0) + 10;

  const { error } = await supabase.from("vendedores").insert({ nome, ordem });
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Atualiza vendedor: PATCH { id, nome?, ativo?, ordem? }
export async function PATCH(request: NextRequest) {
  if (!(await pedidoAutenticado(request))) {
    return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as {
    id?: unknown;
    nome?: unknown;
    ativo?: unknown;
    ordem?: unknown;
  } | null;
  if (!corpo || typeof corpo.id !== "string") {
    return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });
  }

  const mudancas: Record<string, string | boolean | number> = {};
  if (typeof corpo.nome === "string" && corpo.nome.trim()) {
    mudancas.nome = corpo.nome.trim();
  }
  if (typeof corpo.ativo === "boolean") mudancas.ativo = corpo.ativo;
  if (typeof corpo.ordem === "number" && Number.isFinite(corpo.ordem)) {
    mudancas.ordem = corpo.ordem;
  }
  if (Object.keys(mudancas).length === 0) {
    return NextResponse.json({ erro: "Nada para atualizar" }, { status: 400 });
  }

  const supabase = criarClienteAdmin();
  const { error } = await supabase
    .from("vendedores")
    .update(mudancas)
    .eq("id", corpo.id);
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
