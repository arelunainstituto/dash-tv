"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { METRICAS, type Valores } from "@/lib/metricas";
import { formatEurInteiro, formatInt } from "@/lib/formato";

interface PayloadTv {
  mes: string;
  hoje: string;
  atualizadoEm: string;
  vendedores: { nome: string; mes: Valores; hoje: Valores }[];
  totais: { mes: Valores; hoje: Valores };
}

const INTERVALO_POLL_MS = 45_000;
const TIMEOUT_FETCH_MS = 10_000;
const LIMITE_DESATUALIZADO_MS = 3 * 60_000;
const INTERVALO_PIXEL_SHIFT_MS = 10 * 60_000;

const COLUNAS = "1.6fr repeat(6, minmax(0, 1fr))";

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
  const segundosDoDia = pegar("hour") * 3600 + pegar("minute") * 60 + pegar("second");
  const alvo = 4 * 3600;
  const falta = (alvo - segundosDoDia + 24 * 3600) % (24 * 3600);
  return (falta === 0 ? 24 * 3600 : falta) * 1000;
}

function formatValor(tipo: "int" | "eur", v: number): string {
  return tipo === "int" ? formatInt(v) : formatEurInteiro(v);
}

export default function TvBoard({ token }: { token: string }) {
  const [dados, setDados] = useState<PayloadTv | null>(null);
  const [ultimoSucesso, setUltimoSucesso] = useState<number | null>(null);
  const [invalido, setInvalido] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());
  const [desvio, setDesvio] = useState({ x: 0, y: 0 });
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  const buscar = useCallback(async () => {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), TIMEOUT_FETCH_MS);
    try {
      const resposta = await fetch(`/api/tv?token=${encodeURIComponent(token)}`, {
        cache: "no-store",
        signal: controlador.signal,
      });
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
  }, [token]);

  // Polling + refresh imediato quando a página volta a ficar visível.
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
  useEffect(() => {
    const timeout = setTimeout(() => window.location.reload(), msAteAs4Lisboa());
    return () => clearTimeout(timeout);
  }, []);

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

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden bg-[#09090b] text-zinc-100"
      style={{ transform: `translate(${desvio.x}px, ${desvio.y}px)` }}
    >
      {/* Cabeçalho */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-[2vw] py-[1.2vh]">
        <h1 className="text-[clamp(1.2rem,2vw,2.4rem)] font-bold tracking-wide">
          RELATÓRIO COMERCIAL{" "}
          <span className="text-emerald-400">— {dados.mes.toUpperCase()}</span>
        </h1>
        <div className="flex items-center gap-[1.5vw]">
          {invalido && (
            <span className="rounded-full bg-red-500/15 px-4 py-1 text-[clamp(0.8rem,1.1vw,1.3rem)] font-medium text-red-400">
              Acesso inválido — atualize o link da TV
            </span>
          )}
          {!invalido && desatualizado && ultimoSucesso && (
            <span className="rounded-full bg-amber-500/15 px-4 py-1 text-[clamp(0.8rem,1.1vw,1.3rem)] font-medium text-amber-400">
              ⚠ Sem ligação — dados das {horaLisboaDe(ultimoSucesso)}
            </span>
          )}
          <span className="text-[clamp(0.9rem,1.2vw,1.4rem)] text-zinc-500">
            {ultimoSucesso ? `Atualizado às ${horaLisboaDe(ultimoSucesso)}` : ""}
          </span>
          <span className="text-[clamp(1.1rem,1.6vw,2rem)] font-semibold tabular-nums text-zinc-300">
            {horaLisboaDe(agora, true)}
          </span>
        </div>
      </header>

      {/* Cabeçalho das colunas */}
      <div
        className="grid items-center border-b border-zinc-800 px-[2vw] py-[0.8vh]"
        style={{ gridTemplateColumns: COLUNAS }}
      >
        <span />
        {METRICAS.map((m) => (
          <span
            key={m.chave}
            className="text-right text-[clamp(0.8rem,1.3vw,1.6rem)] font-medium uppercase tracking-wider text-zinc-400"
          >
            {m.rotulo}
          </span>
        ))}
      </div>

      {/* Linhas dos vendedores */}
      <div className="flex flex-1 flex-col">
        {dados.vendedores.map((v, i) => (
          <div
            key={v.nome}
            className={`grid flex-1 items-center px-[2vw] ${
              i % 2 === 1 ? "bg-[#111114]" : ""
            }`}
            style={{ gridTemplateColumns: COLUNAS }}
          >
            <span className="truncate text-[clamp(1.1rem,1.9vw,2.4rem)] font-semibold text-zinc-200">
              {v.nome}
            </span>
            {METRICAS.map((m) => (
              <span key={m.chave} className="text-right">
                <span className="block text-[clamp(1.4rem,2.6vw,3.6rem)] font-bold leading-tight tabular-nums">
                  {formatValor(m.tipo, v.mes[m.chave])}
                </span>
                <span className="block text-[clamp(0.7rem,1vw,1.2rem)] leading-tight text-zinc-500">
                  hoje {formatValor(m.tipo, v.hoje[m.chave])}
                </span>
              </span>
            ))}
          </div>
        ))}

        {/* Linha TOTAL */}
        <div
          className="grid items-center border-t-2 border-zinc-700 bg-[#0d1512] px-[2vw] py-[1vh]"
          style={{ gridTemplateColumns: COLUNAS }}
        >
          <span className="text-[clamp(1.2rem,2vw,2.6rem)] font-bold tracking-wide text-emerald-400">
            TOTAL
          </span>
          {METRICAS.map((m) => (
            <span key={m.chave} className="text-right">
              <span className="block text-[clamp(1.6rem,2.9vw,4rem)] font-bold leading-tight tabular-nums text-emerald-300">
                {formatValor(m.tipo, dados.totais.mes[m.chave])}
              </span>
              <span className="block text-[clamp(0.7rem,1vw,1.2rem)] leading-tight text-emerald-700">
                hoje {formatValor(m.tipo, dados.totais.hoje[m.chave])}
              </span>
            </span>
          ))}
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
