import { NextResponse, type NextRequest } from "next/server";
import { pedidoAutenticado } from "@/lib/sessao";

// Protege /admin*. /tv e /api/tv ficam fora do matcher (gateados por token).
export async function proxy(request: NextRequest) {
  const autenticado = await pedidoAutenticado(request);
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && !autenticado) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && autenticado) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/login"],
};
