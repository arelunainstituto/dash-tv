"use client";

import { useCallback, useEffect, useState } from "react";
import type { Vendedor } from "@/lib/metricas";

async function chamarApi(
  metodo: "POST" | "PATCH",
  corpo: Record<string, unknown>
): Promise<string | null> {
  const resposta = await fetch("/api/vendedores", {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  }).catch(() => null);
  if (resposta?.status === 401) {
    window.location.href = "/login";
    return "Sessão expirada";
  }
  if (!resposta?.ok) {
    const json = await resposta?.json().catch(() => null);
    return json?.erro ?? "Erro de ligação";
  }
  return null;
}

export default function PaginaVendedores() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [novoNome, setNovoNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  const carregar = useCallback(async () => {
    const resposta = await fetch("/api/vendedores", { cache: "no-store" }).catch(
      () => null
    );
    if (resposta?.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!resposta?.ok) {
      setErro("Erro ao carregar vendedores.");
      setACarregar(false);
      return;
    }
    const { vendedores: lista } = (await resposta.json()) as {
      vendedores: Vendedor[];
    };
    setVendedores(lista);
    setNomes(Object.fromEntries(lista.map((v) => [v.id, v.nome])));
    setErro(null);
    setACarregar(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function renomear(v: Vendedor) {
    const nome = (nomes[v.id] ?? "").trim();
    if (!nome || nome === v.nome) {
      setNomes((n) => ({ ...n, [v.id]: v.nome }));
      return;
    }
    const falha = await chamarApi("PATCH", { id: v.id, nome });
    if (falha) {
      setErro(`Erro ao renomear: ${falha}`);
      setNomes((n) => ({ ...n, [v.id]: v.nome }));
    } else {
      await carregar();
    }
  }

  async function alternarAtivo(v: Vendedor) {
    const falha = await chamarApi("PATCH", { id: v.id, ativo: !v.ativo });
    if (falha) setErro(`Erro ao atualizar: ${falha}`);
    else await carregar();
  }

  async function mover(v: Vendedor, direcao: -1 | 1) {
    const i = vendedores.findIndex((x) => x.id === v.id);
    const vizinho = vendedores[i + direcao];
    if (!vizinho) return;
    // Troca as ordens dos dois; se forem iguais (dados antigos), separa-as.
    const ordemNova = vizinho.ordem === v.ordem ? v.ordem + direcao : vizinho.ordem;
    const [f1, f2] = await Promise.all([
      chamarApi("PATCH", { id: v.id, ordem: ordemNova }),
      chamarApi("PATCH", { id: vizinho.id, ordem: v.ordem }),
    ]);
    if (f1 || f2) setErro(`Erro ao reordenar: ${f1 ?? f2}`);
    await carregar();
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    const falha = await chamarApi("POST", { nome });
    if (falha) {
      setErro(`Erro ao adicionar: ${falha}`);
    } else {
      setNovoNome("");
      await carregar();
    }
  }

  if (aCarregar) {
    return <p className="text-sm text-zinc-400">A carregar…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-zinc-900">Vendedores</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Vendedores inativos saem da grade de lançamento; continuam no painel
        enquanto tiverem movimento no mês. Não é possível apagar — desative.
      </p>

      {erro && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}

      <ul className="mt-4 divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
        {vendedores.map((v, i) => (
          <li key={v.id} className="flex items-center gap-2 px-3 py-2">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => mover(v, -1)}
                disabled={i === 0}
                className="px-1 text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                aria-label={`Subir ${v.nome}`}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => mover(v, 1)}
                disabled={i === vendedores.length - 1}
                className="px-1 text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                aria-label={`Descer ${v.nome}`}
              >
                ▼
              </button>
            </div>
            <input
              type="text"
              value={nomes[v.id] ?? ""}
              onChange={(e) =>
                setNomes((n) => ({ ...n, [v.id]: e.target.value }))
              }
              onBlur={() => renomear(v)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className={`flex-1 rounded-md border border-transparent px-2 py-1.5 hover:border-zinc-200 focus:border-zinc-400 focus:outline-none ${
                v.ativo ? "text-zinc-900" : "text-zinc-400 line-through"
              }`}
            />
            <button
              type="button"
              onClick={() => alternarAtivo(v)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                v.ativo
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              {v.ativo ? "Ativo" : "Inativo"}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={adicionar} className="mt-4 flex gap-2">
        <input
          type="text"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="Nome do novo vendedor"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!novoNome.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          Adicionar
        </button>
      </form>
    </div>
  );
}
