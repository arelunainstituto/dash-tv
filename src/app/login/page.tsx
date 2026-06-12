"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAEntrar(true);

    const resposta = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, senha }),
    }).catch(() => null);

    if (!resposta?.ok) {
      setErro("Usuário ou senha incorretos.");
      setAEntrar(false);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={entrar}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-zinc-900">
          Relatório Comercial
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Acesso reservado à administração
        </p>

        <label className="mt-6 block text-sm font-medium text-zinc-700">
          Usuário
          <input
            type="text"
            required
            autoComplete="username"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-zinc-700">
          Senha
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
          />
        </label>

        {erro && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={aEntrar}
          className="mt-6 w-full rounded-md bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {aEntrar ? "A entrar…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
