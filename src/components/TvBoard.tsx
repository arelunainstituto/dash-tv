"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { METRICAS, type ChaveMetrica, type Valores } from "@/lib/metricas";
import { formatEurInteiro, formatInt } from "@/lib/formato";
import {
  diasUteisEntre,
  hojeLisboa,
  inicioDaSemana,
  inicioDoMes,
} from "@/lib/datas";

interface LinhaTv {
  nome: string;
  periodo: Valores;
  hoje: Valores;
  metaMes: Valores;
  metaDia: Valores;
}

interface PayloadTv {
  de: string;
  ate: string;
  hoje: string;
  mesRotulo: string;
  atualizadoEm: string;
  vendedores: LinhaTv[];
  totais: {
    periodo: Valores;
    hoje: Valores;
    metaMes: Valores;
    metaDia: Valores;
  };
}

type Modo = "hoje" | "semana" | "mes" | "livre";

const INTERVALO_POLL_MS = 45_000;
const TIMEOUT_FETCH_MS = 10_000;
const LIMITE_DESATUALIZADO_MS = 3 * 60_000;
const INTERVALO_PIXEL_SHIFT_MS = 10 * 60_000;

// Cor de cada métrica (classes literais para o Tailwind gerar)
const CORES: Record<ChaveMetrica, { texto: string; barra: string }> = {
  leads_contatados: { texto: "text-sky-400", barra: "bg-sky-500" },
  video_agendadas: { texto: "text-violet-400", barra: "bg-violet-500" },
  video_realizadas: { texto: "text-fuchsia-400", barra: "bg-fuchsia-500" },
  sinal_recebido: { texto: "text-amber-400", barra: "bg-amber-500" },
  vendas_presencial: { texto: "text-emerald-400", barra: "bg-emerald-500" },
};

const POSICOES = [
  { rotulo: "1º", classe: "bg-yellow-400/20 text-yellow-300 border-yellow-400/50" },
  { rotulo: "2º", classe: "bg-zinc-400/20 text-zinc-200 border-zinc-400/50" },
  { rotulo: "3º", classe: "bg-orange-700/25 text-orange-300 border-orange-500/50" },
];

const GRELHA_TABELA = {
  gridTemplateColumns: "2.1fr repeat(5, minmax(0, 1fr))",
  columnGap: "0.8vw",
};

function horaLisboaDe(ms: number, comSegundos = false): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    ...(comSegundos ? { second: "2-digit" } : {}),
  }).format(new Date(ms));
}

/** Milissegundos até às 04:00 (hora de Lisboa) — reload diário do painel. */
function msAteAs4Lisboa(): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const pegar = (t: string) =>
    Number(partes.find((p) => p.type === t)?.value ?? 0);
  const segundosDoDia =
    pegar("hour") * 3600 + pegar("minute") * 60 + pegar("second");
  const falta = (4 * 3600 - segundosDoDia + 24 * 3600) % (24 * 3600);
  return (falta === 0 ? 24 * 3600 : falta) * 1000;
}

function formatValor(tipo: "int" | "eur", v: number): string {
  return tipo === "int" ? formatInt(v) : formatEurInteiro(v);
}

function pct(parte: number, todo: number): number {
  return todo > 0 ? Math.round((parte / todo) * 100) : 0;
}

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export default function TvBoard({
  token,
  modoInicial = "hoje",
}: {
  token: string;
  modoInicial?: Modo;
}) {
  const [dados, setDados] = useState<PayloadTv | null>(null);
  const [ultimoSucesso, setUltimoSucesso] = useState<number | null>(null);
  const [invalido, setInvalido] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const [desvio, setDesvio] = useState({ x: 0, y: 0 });
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  // Filtro de período — padrão HOJE (ou ?periodo=semana|mes no link)
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [livreDe, setLivreDe] = useState("");
  const [livreAte, setLivreAte] = useState("");

  const hoje = hojeLisboa();
  let de = hoje;
  let ate = hoje;
  if (modo === "semana") de = inicioDaSemana(hoje);
  else if (modo === "mes") de = inicioDoMes(hoje);
  else if (modo === "livre") {
    de = livreDe || hoje;
    ate = livreAte || hoje;
    if (de > ate) [de, ate] = [ate, de];
  }

  const buscar = useCallback(async () => {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), TIMEOUT_FETCH_MS);
    try {
      const resposta = await fetch(
        `/api/tv?token=${encodeURIComponent(token)}&de=${de}&ate=${ate}`,
        { cache: "no-store", signal: controlador.signal }
      );
      if (resposta.status === 401) {
        setInvalido(true);
        return;
      }
      if (!resposta.ok) return;
      const json = (await resposta.json()) as PayloadTv;
      setDados(json);
      setUltimoSucesso(Date.now());
      setInvalido(false);
    } catch {
      // Falha de rede/timeout: mantém os últimos dados no ecrã.
    } finally {
      clearTimeout(timeout);
    }
  }, [token, de, ate]);

  // Polling + refresh imediato ao mudar o filtro ou voltar a ficar visível.
  useEffect(() => {
    buscar();
    const intervalo = setInterval(buscar, INTERVALO_POLL_MS);
    function aoVoltar() {
      if (document.visibilityState === "visible") buscar();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [buscar]);

  // Relógio (1 s) — também recalcula o aviso de dados desatualizados.
  useEffect(() => {
    const intervalo = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(intervalo);
  }, []);

  // Mantém o ecrã da TV acordado (quando o browser suporta).
  useEffect(() => {
    async function pedirWakeLock() {
      try {
        wakeLockRef.current =
          (await navigator.wakeLock?.request("screen")) ?? null;
      } catch {
        // Sem suporte/permissão — depende das definições do dispositivo.
      }
    }
    pedirWakeLock();
    function aoVoltar() {
      if (document.visibilityState === "visible") pedirWakeLock();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  // Anti burn-in: desloca o painel alguns píxeis de tempos a tempos.
  useEffect(() => {
    const intervalo = setInterval(() => {
      setDesvio({
        x: Math.floor(Math.random() * 9),
        y: Math.floor(Math.random() * 9),
      });
    }, INTERVALO_PIXEL_SHIFT_MS);
    return () => clearInterval(intervalo);
  }, []);

  // Reload diário às 04:00 de Lisboa — apanha deploys novos e limpa o browser.
  // Só recarrega com o servidor alcançável; tenta de 15 em 15 min se falhar.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    async function tentarReload() {
      try {
        const r = await fetch(`/api/tv?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        if (r.ok || r.status === 401) {
          window.location.reload();
          return;
        }
      } catch {
        // sem rede — tentar mais tarde
      }
      timeout = setTimeout(tentarReload, 15 * 60_000);
    }
    timeout = setTimeout(tentarReload, msAteAs4Lisboa());
    return () => clearTimeout(timeout);
  }, [token]);

  if (invalido && !dados) {
    return (
      <Ecra>
        <p className="text-4xl font-semibold text-red-400">Acesso inválido</p>
        <p className="mt-4 text-2xl text-zinc-400">
          Atualize o link da TV com o token correto.
        </p>
      </Ecra>
    );
  }

  if (!dados) {
    return (
      <Ecra>
        <p className="text-3xl text-zinc-400">A carregar…</p>
      </Ecra>
    );
  }

  const desatualizado =
    ultimoSucesso !== null && agora - ultimoSucesso > LIMITE_DESATUALIZADO_MS;

  // ---- Métricas derivadas ----
  const t = dados.totais;
  const ranking = [...dados.vendedores].sort(
    (a, b) =>
      b.periodo.vendas_presencial - a.periodo.vendas_presencial ||
      b.periodo.sinal_recebido - a.periodo.sinal_recebido
  );
  const lider = ranking[0]?.periodo.vendas_presencial ?? 0;

  const rotuloPeriodo =
    modo === "hoje"
      ? `HOJE · ${ddmm(dados.hoje)}`
      : modo === "semana"
        ? `SEMANA · ${ddmm(dados.de)}–${ddmm(dados.ate)}`
        : modo === "mes"
          ? dados.mesRotulo.toUpperCase()
          : `${ddmm(dados.de)}–${ddmm(dados.ate)}`;

  const [ano, mesNum] = dados.hoje.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate();
  const fimDoMes = `${dados.hoje.slice(0, 8)}${String(diasNoMes).padStart(2, "0")}`;

  // Sábados, domingos e feriados (Porto) não contam na meta nem no ritmo.
  const diasUteisDecorridos = diasUteisEntre(inicioDoMes(dados.hoje), dados.hoje);
  const diasUteisDoMes = diasUteisEntre(inicioDoMes(dados.hoje), fimDoMes);
  const diasUteisPeriodo = diasUteisEntre(dados.de, dados.ate);

  const projecaoVendas =
    diasUteisDecorridos > 0
      ? (t.periodo.vendas_presencial / diasUteisDecorridos) * diasUteisDoMes
      : 0;
  const metaVendas = t.metaMes.vendas_presencial;

  // Meta ajustada ao período: mês → meta mensal; hoje/semana/livre → meta
  // diária × nº de DIAS ÚTEIS do período (0 num fim de semana/feriado).
  const metaDoPeriodo = (
    metaMes: Valores,
    metaDia: Valores,
    chave: ChaveMetrica
  ): number =>
    modo === "mes" ? metaMes[chave] : metaDia[chave] * diasUteisPeriodo;

  const taxaAgendamento = pct(
    t.periodo.video_agendadas,
    t.periodo.leads_contatados
  );
  const taxaRealizacao = pct(
    t.periodo.video_realizadas,
    t.periodo.video_agendadas
  );

  const destaqueHoje = [...dados.vendedores].sort(
    (a, b) => b.hoje.vendas_presencial - a.hoje.vendas_presencial
  )[0];

  const botaoFiltro = (m: Modo, rotulo: string) => (
    <button
      type="button"
      onClick={() => setModo(m)}
      className={`rounded-full border px-[1vw] py-[0.5vh] text-[clamp(0.7rem,0.95vw,1.2rem)] font-semibold transition-colors ${
        modo === m
          ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
          : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#09090b] text-zinc-100"
      style={{ transform: `translate(${desvio.x}px, ${desvio.y}px)` }}
    >
      {/* Cabeçalho */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-[1.5vw] py-[0.9vh]">
        <h1 className="text-[clamp(1rem,1.6vw,2rem)] font-bold tracking-wide">
          RELATÓRIO COMERCIAL{" "}
          <span className="text-emerald-400">— {rotuloPeriodo}</span>
        </h1>
        <div className="flex items-center gap-[1vw]">
          {invalido && (
            <span className="rounded-full bg-red-500/15 px-4 py-1 text-[clamp(0.75rem,1vw,1.2rem)] font-medium text-red-400">
              Acesso inválido — atualize o link da TV
            </span>
          )}
          {!invalido && desatualizado && ultimoSucesso && (
            <span className="rounded-full bg-amber-500/15 px-4 py-1 text-[clamp(0.75rem,1vw,1.2rem)] font-medium text-amber-400">
              ⚠ Sem ligação — dados das {horaLisboaDe(ultimoSucesso)}
            </span>
          )}
          <span className="text-[clamp(0.75rem,0.95vw,1.15rem)] text-zinc-500">
            {ultimoSucesso ? `Atualizado às ${horaLisboaDe(ultimoSucesso)}` : ""}
          </span>
          <span className="text-[clamp(0.95rem,1.35vw,1.7rem)] font-semibold tabular-nums text-zinc-300">
            {horaLisboaDe(agora, true)}
          </span>
        </div>
      </header>

      {/* Barra de filtros de período */}
      <div className="flex items-center gap-[0.6vw] border-b border-zinc-800/70 px-[1.5vw] py-[0.8vh]">
        <span className="text-[clamp(0.65rem,0.85vw,1.05rem)] uppercase tracking-wider text-zinc-500">
          Período
        </span>
        {botaoFiltro("hoje", "Hoje")}
        {botaoFiltro("semana", "Semana")}
        {botaoFiltro("mes", "Mês")}
        <span className="ml-[0.8vw] text-[clamp(0.65rem,0.85vw,1.05rem)] text-zinc-500">
          De
        </span>
        <input
          type="date"
          value={modo === "livre" ? livreDe || dados.de : dados.de}
          max={hoje}
          onChange={(e) => {
            if (!e.target.value) return;
            setLivreDe(e.target.value);
            if (!livreAte) setLivreAte(modo === "livre" ? livreAte || hoje : ate);
            setModo("livre");
          }}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-[0.6vw] py-[0.4vh] text-[clamp(0.7rem,0.9vw,1.1rem)] text-zinc-300 [color-scheme:dark]"
        />
        <span className="text-[clamp(0.65rem,0.85vw,1.05rem)] text-zinc-500">
          Até
        </span>
        <input
          type="date"
          value={modo === "livre" ? livreAte || dados.ate : dados.ate}
          onChange={(e) => {
            if (!e.target.value) return;
            setLivreAte(e.target.value);
            if (!livreDe) setLivreDe(modo === "livre" ? livreDe || de : de);
            setModo("livre");
          }}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-[0.6vw] py-[0.4vh] text-[clamp(0.7rem,0.9vw,1.1rem)] text-zinc-300 [color-scheme:dark]"
        />
      </div>

      {/* Cartões KPI por métrica */}
      <div className="grid grid-cols-5 gap-[0.8vw] px-[1.5vw] py-[1vh]">
        {METRICAS.map((m) => {
          const cor = CORES[m.chave];
          const meta = metaDoPeriodo(t.metaMes, t.metaDia, m.chave);
          const pctMeta = meta > 0 ? pct(t.periodo[m.chave], meta) : 0;
          return (
            <div
              key={m.chave}
              className="flex min-h-[13vh] flex-col rounded-xl border border-zinc-800 bg-zinc-900/70 px-[0.9vw] py-[1vh]"
            >
              <span
                className={`text-[clamp(0.6rem,0.8vw,1rem)] font-semibold uppercase tracking-wider ${cor.texto}`}
              >
                {m.rotulo}
              </span>
              <span className="mt-[0.5vh] flex flex-wrap items-baseline gap-x-[0.4vw] leading-none">
                <span className="text-[clamp(1.2rem,1.85vw,2.6rem)] font-bold tabular-nums">
                  {formatValor(m.tipo, t.periodo[m.chave])}
                </span>
                {meta > 0 && (
                  <span className="text-[clamp(0.7rem,0.95vw,1.2rem)] font-semibold tabular-nums text-zinc-500">
                    / {formatValor(m.tipo, meta)}
                  </span>
                )}
              </span>
              {modo !== "hoje" && (
                <span className="mt-[0.4vh] text-[clamp(0.65rem,0.85vw,1.05rem)] text-zinc-400">
                  hoje{" "}
                  <span className="font-semibold text-zinc-200">
                    {formatValor(m.tipo, t.hoje[m.chave])}
                  </span>
                </span>
              )}
              {meta > 0 && (
                <div className="mt-auto pt-[0.6vh]">
                  <div className="h-[0.7vh] w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${pctMeta >= 100 ? "bg-emerald-400" : cor.barra}`}
                      style={{ width: `${Math.min(100, pctMeta)}%` }}
                    />
                  </div>
                  <span className="mt-[0.3vh] block text-[clamp(0.55rem,0.75vw,0.95rem)] text-zinc-400">
                    <span
                      className={`font-bold ${pctMeta >= 100 ? "text-emerald-300" : "text-zinc-200"}`}
                    >
                      {pctMeta}%
                    </span>{" "}
                    da meta
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabela-ranking + análise */}
      <div className="flex min-h-0 flex-1 gap-[0.8vw] px-[1.5vw] pb-[1vh]">
        {/* Tabela ordenada por vendas (ranking) */}
        <section className="flex min-w-0 flex-[3] flex-col rounded-xl border border-zinc-800 bg-zinc-900/70 px-[1vw] py-[0.8vh]">
          <div
            className="grid items-center border-b border-zinc-700 pb-[0.6vh]"
            style={GRELHA_TABELA}
          >
            <span className="text-[clamp(0.7rem,0.95vw,1.2rem)] font-semibold uppercase tracking-wider text-zinc-300">
              🏆 Vendedor
            </span>
            {METRICAS.map((m) => (
              <span
                key={m.chave}
                className={`text-right text-[clamp(0.55rem,0.75vw,0.95rem)] font-semibold uppercase tracking-wide ${CORES[m.chave].texto}`}
              >
                {m.rotuloCurto}
              </span>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            {ranking.map((v, i) => {
              const pos = POSICOES[i] ?? {
                rotulo: `${i + 1}º`,
                classe: "bg-zinc-800/60 text-zinc-400 border-zinc-700",
              };
              const metaVendedor = metaDoPeriodo(
                v.metaMes,
                v.metaDia,
                "vendas_presencial"
              );
              const pctVendedor =
                metaVendedor > 0
                  ? pct(v.periodo.vendas_presencial, metaVendedor)
                  : null;
              const corBarra =
                pctVendedor === null
                  ? "bg-emerald-500/80"
                  : pctVendedor >= 100
                    ? "bg-emerald-400"
                    : pctVendedor >= 50
                      ? "bg-amber-400"
                      : "bg-red-400";
              return (
                <div
                  key={v.nome}
                  className={`grid flex-1 items-center ${
                    i > 0 ? "border-t border-zinc-800/70" : ""
                  }`}
                  style={GRELHA_TABELA}
                >
                  <div className="flex min-w-0 items-center gap-[0.6vw]">
                    <span
                      className={`flex h-[3.6vh] w-[3.6vh] shrink-0 items-center justify-center rounded-full border text-[clamp(0.65rem,0.85vw,1.1rem)] font-bold ${pos.classe}`}
                    >
                      {pos.rotulo}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[clamp(0.85rem,1.15vw,1.5rem)] font-semibold text-zinc-100">
                        {v.nome}
                      </span>
                      <div className="mt-[0.3vh] flex items-center gap-[0.5vw]">
                        <div className="h-[0.5vh] min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-full rounded-full ${corBarra}`}
                            style={{
                              width: `${
                                pctVendedor !== null
                                  ? Math.min(100, pctVendedor)
                                  : pct(v.periodo.vendas_presencial, lider)
                              }%`,
                            }}
                          />
                        </div>
                        {pctVendedor !== null && (
                          <span
                            className={`shrink-0 text-[clamp(0.55rem,0.75vw,0.95rem)] font-semibold tabular-nums ${
                              pctVendedor >= 100
                                ? "text-emerald-300"
                                : pctVendedor >= 50
                                  ? "text-amber-300"
                                  : "text-red-300"
                            }`}
                          >
                            {pctVendedor}% da meta
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {METRICAS.map((m) => {
                    const metaCelula = metaDoPeriodo(
                      v.metaMes,
                      v.metaDia,
                      m.chave
                    );
                    return (
                      <span key={m.chave} className="text-right">
                        <span
                          className={`block text-[clamp(0.8rem,1.1vw,1.45rem)] font-semibold leading-tight tabular-nums ${
                            m.chave === "vendas_presencial"
                              ? "text-emerald-300"
                              : "text-zinc-200"
                          }`}
                        >
                          {formatValor(m.tipo, v.periodo[m.chave])}
                        </span>
                        {metaCelula > 0 && (
                          <span className="block text-[clamp(0.55rem,0.75vw,0.95rem)] leading-tight tabular-nums text-zinc-500">
                            / {formatValor(m.tipo, metaCelula)}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              );
            })}
            {/* TOTAL */}
            <div
              className="grid items-center border-t-2 border-zinc-700 py-[0.7vh]"
              style={GRELHA_TABELA}
            >
              <span className="text-[clamp(0.85rem,1.15vw,1.5rem)] font-bold tracking-wide text-emerald-400">
                TOTAL
              </span>
              {METRICAS.map((m) => {
                const metaTotal = metaDoPeriodo(t.metaMes, t.metaDia, m.chave);
                return (
                  <span key={m.chave} className="text-right">
                    <span className="block text-[clamp(0.85rem,1.2vw,1.6rem)] font-bold leading-tight tabular-nums text-emerald-300">
                      {formatValor(m.tipo, t.periodo[m.chave])}
                    </span>
                    {metaTotal > 0 && (
                      <span className="block text-[clamp(0.55rem,0.75vw,0.95rem)] leading-tight tabular-nums text-emerald-700">
                        / {formatValor(m.tipo, metaTotal)}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </section>

        {/* Coluna de análise */}
        <div className="flex min-w-0 flex-[2] flex-col gap-[0.8vw]">
          {/* Funil de conversão */}
          <section className="flex flex-1 flex-col justify-center rounded-xl border border-zinc-800 bg-zinc-900/70 px-[1.1vw] py-[0.8vh]">
            <h2 className="text-[clamp(0.7rem,0.95vw,1.2rem)] font-semibold uppercase tracking-wider text-zinc-300">
              Funil de conversão
            </h2>
            {(
              [
                {
                  rotulo: "Leads contatados",
                  valor: t.periodo.leads_contatados,
                  taxa: null,
                  cor: CORES.leads_contatados,
                  largura: 100,
                },
                {
                  rotulo: "Vídeo agendadas",
                  valor: t.periodo.video_agendadas,
                  taxa: `${taxaAgendamento}% dos leads`,
                  cor: CORES.video_agendadas,
                  largura: pct(
                    t.periodo.video_agendadas,
                    t.periodo.leads_contatados
                  ),
                },
                {
                  rotulo: "Vídeo realizadas",
                  valor: t.periodo.video_realizadas,
                  taxa: `${taxaRealizacao}% das agendadas`,
                  cor: CORES.video_realizadas,
                  largura: pct(
                    t.periodo.video_realizadas,
                    t.periodo.leads_contatados
                  ),
                },
              ] as const
            ).map((etapa) => (
              <div key={etapa.rotulo} className="mt-[0.8vh]">
                <div className="flex items-baseline justify-between text-[clamp(0.65rem,0.9vw,1.15rem)]">
                  <span className="text-zinc-300">{etapa.rotulo}</span>
                  <span>
                    <span
                      className={`font-bold tabular-nums ${etapa.cor.texto}`}
                    >
                      {formatInt(etapa.valor)}
                    </span>
                    {etapa.taxa && (
                      <span className="ml-2 text-zinc-500">{etapa.taxa}</span>
                    )}
                  </span>
                </div>
                <div className="mt-[0.3vh] h-[1.2vh] w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${etapa.cor.barra}`}
                    style={{ width: `${Math.max(2, etapa.largura)}%` }}
                  />
                </div>
              </div>
            ))}
          </section>

          {/* Ritmo / projeção */}
          <section className="flex flex-1 flex-col justify-center rounded-xl border border-zinc-800 bg-zinc-900/70 px-[1.1vw] py-[0.8vh]">
            <h2 className="text-[clamp(0.7rem,0.95vw,1.2rem)] font-semibold uppercase tracking-wider text-zinc-300">
              {modo === "mes" ? "Projeção de vendas" : "Ritmo de vendas"}
            </h2>
            {modo === "mes" ? (
              <>
                <div className="mt-[0.6vh] flex items-baseline gap-[0.8vw]">
                  <span className="text-[clamp(1.2rem,1.9vw,2.6rem)] font-bold tabular-nums text-emerald-300">
                    {formatEurInteiro(projecaoVendas)}
                  </span>
                  <span className="text-[clamp(0.65rem,0.9vw,1.15rem)] text-zinc-500">
                    no ritmo atual (dia útil {diasUteisDecorridos} de{" "}
                    {diasUteisDoMes})
                  </span>
                </div>
                {metaVendas > 0 ? (
                  <p className="mt-[0.5vh] text-[clamp(0.7rem,0.95vw,1.2rem)] text-zinc-400">
                    {projecaoVendas >= metaVendas ? (
                      <span className="font-semibold text-emerald-300">
                        ✓ No caminho para bater a meta de{" "}
                        {formatEurInteiro(metaVendas)}
                      </span>
                    ) : (
                      <span>
                        Faltam{" "}
                        <span className="font-semibold text-amber-300">
                          {formatEurInteiro(
                            Math.max(
                              0,
                              metaVendas - t.periodo.vendas_presencial
                            )
                          )}
                        </span>{" "}
                        para a meta de {formatEurInteiro(metaVendas)}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-[0.5vh] text-[clamp(0.65rem,0.85vw,1.05rem)] text-zinc-600">
                    Defina as metas do mês em /admin/metas
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="mt-[0.6vh] flex items-baseline gap-[0.8vw]">
                  <span className="text-[clamp(1.2rem,1.9vw,2.6rem)] font-bold tabular-nums text-emerald-300">
                    {formatEurInteiro(
                      modo === "hoje" || diasUteisPeriodo === 0
                        ? t.periodo.vendas_presencial
                        : t.periodo.vendas_presencial / diasUteisPeriodo
                    )}
                  </span>
                  <span className="text-[clamp(0.65rem,0.9vw,1.15rem)] text-zinc-500">
                    {modo === "hoje"
                      ? "em vendas no dia"
                      : diasUteisPeriodo > 0
                        ? `média por dia útil (${diasUteisPeriodo} dias úteis)`
                        : "sem dias úteis no período"}
                  </span>
                </div>
                <p className="mt-[0.5vh] text-[clamp(0.7rem,0.95vw,1.2rem)] text-zinc-400">
                  Sinais recebidos{" "}
                  <span className="font-semibold text-amber-300">
                    {formatInt(t.periodo.sinal_recebido)}
                  </span>
                </p>
              </>
            )}
          </section>

          {/* Hoje */}
          <section className="flex flex-1 flex-col justify-center rounded-xl border border-zinc-800 bg-zinc-900/70 px-[1.1vw] py-[0.8vh]">
            <h2 className="text-[clamp(0.7rem,0.95vw,1.2rem)] font-semibold uppercase tracking-wider text-zinc-300">
              Hoje
            </h2>
            <div className="mt-[0.6vh] flex items-baseline gap-[0.8vw]">
              <span className="text-[clamp(1.2rem,1.9vw,2.6rem)] font-bold tabular-nums text-zinc-100">
                {formatEurInteiro(t.hoje.vendas_presencial)}
              </span>
              <span className="text-[clamp(0.65rem,0.9vw,1.15rem)] text-zinc-500">
                em vendas · {formatInt(t.hoje.leads_contatados)} leads
              </span>
            </div>
            {destaqueHoje && destaqueHoje.hoje.vendas_presencial > 0 ? (
              <p className="mt-[0.5vh] text-[clamp(0.7rem,0.95vw,1.2rem)] text-zinc-400">
                ⭐ Destaque:{" "}
                <span className="font-semibold text-yellow-300">
                  {destaqueHoje.nome}
                </span>{" "}
                com{" "}
                <span className="font-semibold text-emerald-300">
                  {formatEurInteiro(destaqueHoje.hoje.vendas_presencial)}
                </span>
              </p>
            ) : (
              <p className="mt-[0.5vh] text-[clamp(0.65rem,0.85vw,1.05rem)] text-zinc-600">
                Ainda sem vendas registadas hoje
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Ecra({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#09090b] text-center">
      {children}
    </div>
  );
}
