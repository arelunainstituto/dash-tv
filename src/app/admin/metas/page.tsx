"use client";

import { useCallback, useEffect, useState } from "react";
import {
  METRICAS,
  METRICAS_EDITAVEIS,
  type ChaveMetrica,
  type Valores,
  type Vendedor,
} from "@/lib/metricas";
import { diasUteisDoMes, hojeLisboa, horaLisboa } from "@/lib/datas";
import {
  eurParaTexto,
  formatEur,
  formatInt,
  parseEur,
  parseInteiro,
} from "@/lib/formato";
import IntInput from "@/components/IntInput";
import MoneyInput from "@/components/MoneyInput";

type Campos = Record<ChaveMetrica, string>;

interface LinhaApi {
  vendedor_id: string;
  mensal: Valores;
  diaria: Valores;
}

const camposVazios = (): Campos => ({
  leads_contatados: "",
  video_agendadas: "",
  video_realizadas: "",
  sinal_recebido: "",
  vendas_presencial: "",
});

export default function PaginaMetas() {
  const [mes, setMes] = useState(() => hojeLisboa().slice(0, 7));
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [linhas, setLinhas] = useState<Record<string, Campos>>({});
  const [aCarregar, setACarregar] = useState(true);
  const [aGuardar, setAGuardar] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(
    null
  );
  const [invalidas, setInvalidas] = useState<Set<string>>(new Set());

  const diasUteis = diasUteisDoMes(mes);

  const carregar = useCallback(async (m: string) => {
    setACarregar(true);
    setMsg(null);
    setInvalidas(new Set());

    const [rVend, rMetas] = await Promise.all([
      fetch("/api/vendedores", { cache: "no-store" }).catch(() => null),
      fetch(`/api/metas?mes=${m}`, { cache: "no-store" }).catch(() => null),
    ]);
    if (rVend?.status === 401 || rMetas?.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!rVend?.ok) {
      setMsg({ tipo: "erro", texto: "Erro ao carregar vendedores." });
      setACarregar(false);
      return;
    }
    const ativos = (
      ((await rVend.json()) as { vendedores: Vendedor[] }).vendedores ?? []
    ).filter((v) => v.ativo);
    setVendedores(ativos);

    const porVendedor: Record<string, Campos> = {};
    for (const v of ativos) porVendedor[v.id] = camposVazios();

    if (!rMetas?.ok) {
      const json = await rMetas?.json().catch(() => null);
      setMsg({ tipo: "erro", texto: json?.erro ?? "Erro ao carregar metas." });
      setLinhas(porVendedor);
      setACarregar(false);
      return;
    }
    const { linhas: existentes } = (await rMetas.json()) as {
      linhas: LinhaApi[];
    };
    for (const linha of existentes ?? []) {
      const alvo = porVendedor[linha.vendedor_id];
      if (!alvo) continue;
      for (const m2 of METRICAS_EDITAVEIS) {
        const v = linha.diaria[m2.chave];
        if (v > 0) {
          alvo[m2.chave] = m2.tipo === "int" ? String(v) : eurParaTexto(v);
        }
      }
    }
    setLinhas(porVendedor);
    setACarregar(false);
  }, []);

  useEffect(() => {
    carregar(mes);
  }, [mes, carregar]);

  function aoEditar(vendedorId: string, chave: ChaveMetrica, texto: string) {
    setLinhas((l) => ({
      ...l,
      [vendedorId]: { ...l[vendedorId], [chave]: texto },
    }));
    const chaveCelula = `${vendedorId}:${chave}`;
    if (invalidas.has(chaveCelula)) {
      const novas = new Set(invalidas);
      novas.delete(chaveCelula);
      setInvalidas(novas);
    }
  }

  function valorCelula(vendedorId: string, chave: ChaveMetrica): number | null {
    const m = METRICAS.find((x) => x.chave === chave)!;
    const texto = linhas[vendedorId]?.[chave] ?? "";
    return m.tipo === "int" ? parseInteiro(texto) : parseEur(texto);
  }

  function totalDia(chave: ChaveMetrica): number {
    let soma = 0;
    for (const v of vendedores) soma += valorCelula(v.id, chave) ?? 0;
    return soma;
  }

  async function guardar() {
    if (aGuardar || aCarregar) return;

    const erradas = new Set<string>();
    const corpo = vendedores.map((v) => {
      const diaria = {} as Valores;
      for (const m of METRICAS_EDITAVEIS) {
        const n = valorCelula(v.id, m.chave);
        if (n === null) erradas.add(`${v.id}:${m.chave}`);
        else diaria[m.chave] = n;
      }
      return { vendedor_id: v.id, diaria };
    });

    if (erradas.size > 0) {
      setInvalidas(erradas);
      setMsg({ tipo: "erro", texto: "Há valores inválidos (a vermelho)." });
      return;
    }

    setAGuardar(true);
    setMsg(null);
    const resposta = await fetch("/api/metas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, linhas: corpo }),
    }).catch(() => null);
    setAGuardar(false);

    if (resposta?.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!resposta?.ok) {
      const json = await resposta?.json().catch(() => null);
      setMsg({ tipo: "erro", texto: json?.erro ?? "Erro ao guardar." });
      return;
    }
    setMsg({ tipo: "ok", texto: `Metas guardadas às ${horaLisboa()}.` });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            Metas diárias por vendedor
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Digite só a meta por dia útil. A meta do mês é calculada
            automaticamente: diária × dias úteis (sábados, domingos e feriados
            do Porto não contam). Deixe 0 para não definir meta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={mes}
            onChange={(e) => e.target.value && setMes(e.target.value)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={guardar}
            disabled={aGuardar || aCarregar}
            className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
          >
            {aGuardar ? "A guardar…" : "Guardar metas"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-sm text-zinc-600">
        Este mês tem <span className="font-semibold">{diasUteis} dias úteis</span>.
      </p>

      {msg && (
        <p
          className={`mt-3 rounded-md px-3 py-2 text-sm ${
            msg.tipo === "ok"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
              <th className="px-3 py-2.5 font-medium text-zinc-600">
                Vendedor
              </th>
              {METRICAS.map((m) => (
                <th
                  key={m.chave}
                  className="px-3 py-2.5 text-right font-medium text-zinc-600"
                >
                  {m.rotulo}
                  {m.tipo === "eur" && (
                    <span className="ml-1 text-zinc-400">€</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={aCarregar ? "opacity-40" : ""}>
            {vendedores.map((v) => (
              <tr key={v.id} className="border-b border-zinc-100">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-zinc-800">
                  {v.nome}
                </td>
                {METRICAS.map((m) => (
                  <td key={m.chave} className="px-2 py-1.5">
                    {m.tipo === "int" ? (
                      <IntInput
                        valor={linhas[v.id]?.[m.chave] ?? ""}
                        onChange={(t) => aoEditar(v.id, m.chave, t)}
                        invalida={invalidas.has(`${v.id}:${m.chave}`)}
                      />
                    ) : (
                      <MoneyInput
                        valor={linhas[v.id]?.[m.chave] ?? ""}
                        onChange={(t) => aoEditar(v.id, m.chave, t)}
                        invalida={invalidas.has(`${v.id}:${m.chave}`)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-zinc-50 font-semibold text-zinc-800">
              <td className="px-3 py-2.5">Total da equipa (por dia)</td>
              {METRICAS.map((m) => (
                <td
                  key={m.chave}
                  className="px-3 py-2.5 text-right tabular-nums"
                >
                  {m.tipo === "int"
                    ? formatInt(totalDia(m.chave))
                    : formatEur(totalDia(m.chave))}
                </td>
              ))}
            </tr>
            <tr className="bg-emerald-50/60 font-semibold text-emerald-800">
              <td className="px-3 py-2.5">
                Meta do mês (× {diasUteis} dias úteis)
              </td>
              {METRICAS.map((m) => (
                <td
                  key={m.chave}
                  className="px-3 py-2.5 text-right tabular-nums"
                >
                  {m.tipo === "int"
                    ? formatInt(totalDia(m.chave) * diasUteis)
                    : formatEur(totalDia(m.chave) * diasUteis)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
