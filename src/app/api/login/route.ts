import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, credenciaisValidas, tokenSessao } from "@/lib/sessao";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}));
  const { usuario, senha } = corpo as { usuario?: string; senha?: string };

  if (!credenciaisValidas(usuario ?? "", senha ?? "")) {
    return NextResponse.json({ erro: "Credenciais inválidas" }, { status: 401 });
  }

  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_SESSAO, await tokenSessao(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
    path: "/",
  });
  return resposta;
}

// Logout
export async function DELETE() {
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_SESSAO, "", { maxAge: 0, path: "/" });
  return resposta;
}
