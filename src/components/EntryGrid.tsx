"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  METRICAS,
  METRICAS_EDITAVEIS,
  type ChaveMetrica,
  type Lancamento,
  type Vendedor,
} from "@/lib/metricas";
import { hojeLisboa, horaLisboa, dataCurta } from "@/lib/datas";
import {
  eurParaTexto,
  formatEur,
  formatInt,
  parseEur,
  parseInteiro,
} from "@/lib/formato";
import DateNav from "@/components/DateNav";
import IntInput from "@/components/IntInput";
import MoneyInput from "@/components/MoneyInput";

type Celulas = Record<string, Record<ChaveMetrica, string>>;

function celulasVazias(vendedores: Vendedor[]): Celulas {
  const c: Celulas = {};
  for (const v of vendedores) {
    c[v.id] = {
      leads_contatados: "",
      video_agendadas: "",
      video_realizadas: "",
      sinal_recebido: "",
      vendas_presencial: "",
    };
  }
  return c;
}

function parseCelula(tipo: "int" | "eur", texto: string): number | null {
  return tipo === "int" ? parseInteiro(texto) : parseEur(texto);
}

export default function EntryGrid({ vendedores }: { vendedores: Vendedor[] }) {
  const [dataSel, setDataSel] = useState(hojeLisboa);
  const [celulas, setCelulas] = useState<Celulas>(() =>
    celulasVazias(vendedores)
  );
  const [baseline, setBaseline] = useState<string>(() =>
    JSON.stringify(celulasVazias(vendedores))
  );
  const [aCarregar, setACarregar] = useState(true);
  const [aGuardar, setAGuardar] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(
    null
  );
  const [invalidas, setInvalidas] = useState<Set<string>>(new Set());
  const gradeRef = useRef<HTMLDivElement>(null);

  const sujo = JSON.stringify(celulas) !== baseline;

  // Carrega os lançamentos do dia selecionado e preenche a grade.
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setACarregar(true);
      setMsg(null);
      setInvalidas(new Set());
      const resposta = await fetch(`/api/dados?data=${dataSel}`, {
        cache: "no-store",
      }).catch(() => null);

      if (cancelado) return;

      if (resposta?.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!resposta?.ok) {
        setMsg({ tipo: "erro", texto: "Erro ao carregar os dados do dia." });
        setACarregar(false);
        return;
      }

      const { lancamentos } = (await resposta.json()) as {
        lancamentos: Lancamento[];
      };
      const novas = celulasVazias(vendedores);
      for (const linha of lancamentos ?? []) {
        if (!novas[linha.vendedor_id]) continue;
        for (const m of METRICAS) {
          const valor = linha[m.chave];
          if (valor > 0) {
            novas[linha.vendedor_id][m.chave] =
              m.tipo === "int" ? String(valor) : eurParaTexto(valor);
          }
        }
      }
      setCelulas(novas);
      setBaseline(JSON.stringify(novas));
      setACarregar(false);
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [dataSel, vendedores]);

  // Aviso ao sair com alterações por guardar: fechar/recarregar a página
  // (beforeunload) e navegação interna (links do menu e botão Sair).
  useEffect(() => {
    if (!sujo) return;
    function avisar(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    function aoClicarFora(e: MouseEvent) {
      const alvo = (e.target as HTMLElement).closest?.(
        "a[href], [data-sair]"
      );
      if (!alvo) return;
      if (!window.confirm("Há alterações por guardar. Sair sem guardar?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    window.addEventListener("beforeunload", avisar);
    document.addEventListener("click", aoClicarFora, true);
    return () => {
      window.removeEventListener("beforeunload", avisar);
      document.removeEventListener("click", aoClicarFora, true);
    };
  }, [sujo]);

  function mudarData(nova: string) {
    if (aGuardar) return;
    if (
      sujo &&
      !window.confirm("Há alterações por guardar. Mudar de dia sem guardar?")
    ) {
      return;
    }
    setDataSel(nova);
  }

  function aoEditar(vendedorId: string, chave: ChaveMetrica, texto: string) {
    setCelulas((c) => ({
      ...c,
      [vendedorId]: { ...c[vendedorId], [chave]: texto },
    }));
    if (invalidas.size > 0) {
      const novas = new Set(invalidas);
      novas.delete(`${vendedorId}:${chave}`);
      setInvalidas(novas);
    }
  }

  const guardar = useCallback(async () => {
    // Não gravar durante o carregamento de um dia: as células ainda são do
    // dia anterior e iriam parar na data recém-selecionada.
    if (aGuardar || aCarregar) return;

    const erradas = new Set<string>();
    const linhas = vendedores.map((v) => {
      const linha: Record<string, string | number> = {
        vendedor_id: v.id,
        data: dataSel,
      };
      for (const m of METRICAS_EDITAVEIS) {
        const n = parseCelula(m.tipo, celulas[v.id]?.[m.chave] ?? "");
        if (n === null) {
          erradas.add(`${v.id}:${m.chave}`);
        } else {
          linha[m.chave] = n;
        }
      }
      return linha;
    });

    if (erradas.size > 0) {
      setInvalidas(erradas);
      setMsg({
        tipo: "erro",
        texto: "Há valores inválidos (a vermelho). Corrija antes de guardar.",
      });
      return;
    }

    setAGuardar(true);
    setMsg(null);
    const resposta = await fetch("/api/dados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linhas }),
    }).catch(() => null);

    setAGuardar(false);
    if (resposta?.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!resposta?.ok) {
      const corpo = await resposta?.json().catch(() => null);
      setMsg({
        tipo: "erro",
        texto: `Erro ao guardar — tente novamente.${corpo?.erro ? ` (${corpo.erro})` : ""}`,
      });
      return;
    }
    setBaseline(JSON.stringify(celulas));
    setMsg({ tipo: "ok", texto: `Guardado com sucesso às ${horaLisboa()}.` });
  }, [aGuardar, aCarregar, vendedores, dataSel, celulas]);

  // Enter avança como Tab; Ctrl/Cmd+S guarda.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        guardar();
        return;
      }
      if (e.key !== "Enter") return;
      const alvo = e.target as HTMLElement;
      if (!alvo.matches?.("input[data-grade]")) return;
      e.preventDefault();
      const inputs = Array.from(
        gradeRef.current?.querySelectorAll<HTMLInputElement>(
          "input[data-grade]"
        ) ?? []
      );
      const i = inputs.indexOf(alvo as HTMLInputElement);
      if (i >= 0 && i < inputs.length - 1) {
        inputs[i + 1].focus();
      } else {
        guardar();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [guardar]);

  // Totais do dia ao vivo (texto inválido conta como 0) — pega gralhas.
  const totais: Record<ChaveMetrica, number> = {
    leads_contatados: 0,
    video_agendadas: 0,
    video_realizadas: 0,
    sinal_recebido: 0,
    vendas_presencial: 0,
  };
  for (const v of vendedores) {
    for (const m of METRICAS_EDITAVEIS) {
      const n = parseCelula(m.tipo, celulas[v.id]?.[m.chave] ?? "");
      if (n !== null) totais[m.chave] += n;
    }
  }

  return (
    <div ref={gradeRef}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateNav data={dataSel} onChange={mudarData} />
        <div className="flex items-center gap-3">
          {sujo && !aGuardar && (
            <span className="text-sm text-amber-600">
              Alterações por guardar
            </span>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={aGuardar || aCarregar || !sujo}
            className="rounded-md bg-zinc-900 px-5 py-2 font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
          >
            {aGuardar ? "A guardar…" : "Guardar"}
          </button>
        </div>
      </div>

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
                Vendedor — {dataCurta(dataSel)}
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
                        valor={celulas[v.id]?.[m.chave] ?? ""}
                        onChange={(t) => aoEditar(v.id, m.chave, t)}
                        invalida={invalidas.has(`${v.id}:${m.chave}`)}
                      />
                    ) : (
                      <MoneyInput
                        valor={celulas[v.id]?.[m.chave] ?? ""}
                        onChange={(t) => aoEditar(v.id, m.chave, t)}
                        invalida={invalidas.has(`${v.id}:${m.chave}`)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-zinc-50 font-semibold text-zinc-800">
              <td className="px-3 py-2.5">Total do dia</td>
              {METRICAS.map((m) => (
                <td
                  key={m.chave}
                  className="px-3 py-2.5 text-right tabular-nums"
                >
                  {m.tipo === "int"
                    ? formatInt(totais[m.chave])
                    : formatEur(totais[m.chave])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        Campos vazios contam como 0. Enter avança para o campo seguinte;
        Ctrl/Cmd+S guarda. Para corrigir um dia anterior, navegue até à data e
        guarde de novo.
      </p>
    </div>
  );
}
