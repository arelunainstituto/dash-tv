import type { NextRequest } from "next/server";

// Login simples: um usuário/senha fixos definidos no .env.local.
// A sessão é um cookie httpOnly com o hash das credenciais — trocar a
// senha invalida todas as sessões. Funciona em edge (proxy) e node (rotas).

export const COOKIE_SESSAO = "sessao";

export function credenciaisValidas(usuario: string, senha: string): boolean {
  const u = process.env.ADMIN_USER ?? "admin";
  const s = process.env.ADMIN_PASSWORD ?? "";
  return s.length > 0 && usuario === u && senha === s;
}

export async function tokenSessao(): Promise<string> {
  const dados = new TextEncoder().encode(
    `${process.env.ADMIN_USER ?? "admin"}:${process.env.ADMIN_PASSWORD ?? ""}:dash-comercial-v1`
  );
  const hash = await crypto.subtle.digest("SHA-256", dados);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function pedidoAutenticado(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get(COOKIE_SESSAO)?.value;
  return !!cookie && cookie === (await tokenSessao());
}
