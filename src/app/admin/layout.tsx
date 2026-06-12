import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, tokenSessao } from "@/lib/sessao";
import BotaoSair from "@/components/BotaoSair";

// Revalida a sessão server-side mesmo com o proxy à frente (defesa em
// profundidade contra erros de matcher).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessao = cookieStore.get(COOKIE_SESSAO)?.value;
  if (!sessao || sessao !== (await tokenSessao())) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-zinc-900">
              Relatório Comercial
            </span>
            <nav className="flex gap-4 text-sm">
              <Link href="/admin" className="text-zinc-600 hover:text-zinc-900">
                Diário
              </Link>
              <Link
                href="/admin/resumo"
                className="text-zinc-600 hover:text-zinc-900"
              >
                Resumo
              </Link>
              <Link
                href="/admin/vendedores"
                className="text-zinc-600 hover:text-zinc-900"
              >
                Vendedores
              </Link>
              <Link
                href="/admin/metas"
                className="text-zinc-600 hover:text-zinc-900"
              >
                Metas
              </Link>
            </nav>
          </div>
          <BotaoSair />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
