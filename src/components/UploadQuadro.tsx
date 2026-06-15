"use client";

import { useState } from "react";
import {
  METRICAS,
  METRICAS_EDITAVEIS,
  type ChaveMetrica,
} from "@/lib/metricas";
import { eurParaTexto, parseEur, parseInteiro } from "@/lib/formato";
import { dataCurta, hojeLisboa } from "@/lib/datas";
import IntInput from "@/components/IntInput";
import MoneyInput from "@/components/MoneyInput";

interface Vendedor {
  id: string;
  nome: string;
}

interface LinhaExtraida {
  nome?: string;
  vendedor_id?: string | null;
  leads_contatados?: number;
  video_agendadas?: number;
  video_realizadas?: number;
  sinal_recebido?: number;
  vendas_presencial?: number;
}

interface LinhaConferir {
  nome: string;
  vendedorId: string;
  campos: Record<ChaveMetrica, string>;
}

type Etapa = "inicial" | "analisando" | "conferir" | "guardando" | "ok";

// Reduz a imagem no browser antes do upload (mais rápido, menos tokens).
async function reduzirImagem(file: File, maxLado = 1600, qualidade = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))),
      "image/jpeg",
      qualidade
    )
  );
}

function valorInicial(tipo: "int" | "eur", v: number | undefined): string {
  const n = Number(v ?? 0);
  if (tipo === "int") return String(Math.max(0, Math.round(n)));
  return n > 0 ? eurParaTexto(n) : "";
}

const PASSOS = ["Foto", "Conferir", "Pronto"] as const;

export default function UploadQuadro() {
  const [etapa, setEtapa] = useState<Etapa>("inicial");
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [data, setData] = useState(hojeLisboa);
  const [linhas, setLinhas] = useState<LinhaConferir[]>([]);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [invalidas, setInvalidas] = useState<Set<string>>(new Set());

  const hoje = hojeLisboa();
  const passoAtivo =
    etapa === "ok" ? 2 : etapa === "conferir" || etapa === "guardando" ? 1 : 0;

  async function processarFicheiro(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg({ tipo: "erro", texto: "Escolha um ficheiro de imagem." });
      return;
    }
    setMsg(null);
    let b: Blob = file;
    try {
      b = await reduzirImagem(file);
    } catch {
      b = file; // fallback: envia o original
    }
    setBlob(b);
    setPreview(URL.createObjectURL(b));
    setEtapa("inicial");
  }

  async function analisar() {
    if (!blob) return;
    setEtapa("analisando");
    setMsg(null);
    const form = new FormData();
    form.append("file", blob, "quadro.jpg");
    const r = await fetch("/api/upload-quadro/extrair", {
      method: "POST",
      body: form,
    }).catch(() => null);

    if (!r?.ok) {
      const j = await r?.json().catch(() => null);
      setMsg({ tipo: "erro", texto: j?.erro ?? "Falha ao analisar a imagem." });
      setEtapa("inicial");
      return;
    }
    const j = (await r.json()) as {
      data: string | null;
      linhas: LinhaExtraida[];
      vendedores: Vendedor[];
    };
    setVendedores(j.vendedores ?? []);
    setData(j.data && /^\d{4}-\d{2}-\d{2}$/.test(j.data) ? j.data : hoje);
    setLinhas(
      (j.linhas ?? []).map((l) => {
        const campos = {} as Record<ChaveMetrica, string>;
        for (const m of METRICAS) campos[m.chave] = valorInicial(m.tipo, l[m.chave]);
        return { nome: l.nome ?? "", vendedorId: l.vendedor_id ?? "", campos };
      })
    );
    setInvalidas(new Set());
    setEtapa(j.linhas?.length ? "conferir" : "inicial");
    if (!j.linhas?.length) {
      setMsg({ tipo: "erro", texto: "Não consegui ler vendedores no quadro. Tente uma foto mais nítida." });
    }
  }

  function editarCampo(i: number, chave: ChaveMetrica, texto: string) {
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, campos: { ...l.campos, [chave]: texto } } : l)));
    const ch = `${i}:${chave}`;
    if (invalidas.has(ch)) {
      const novas = new Set(invalidas);
      novas.delete(ch);
      setInvalidas(novas);
    }
  }

  function editarVendedor(i: number, id: string) {
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, vendedorId: id } : l)));
  }

  async function guardar() {
    if (etapa === "guardando") return;

    const usadas = linhas.filter((l) => l.vendedorId);
    if (usadas.length === 0) {
      setMsg({ tipo: "erro", texto: "Escolha o vendedor de pelo menos uma linha." });
      return;
    }
    // Sem o mesmo vendedor em duas linhas (o upsert do dia colidiria).
    const ids = usadas.map((l) => l.vendedorId);
    if (new Set(ids).size !== ids.length) {
      setMsg({ tipo: "erro", texto: "Há o mesmo vendedor em duas linhas. Ajuste antes de guardar." });
      return;
    }

    const erradas = new Set<string>();
    const corpo = usadas.map((l) => {
      const i = linhas.indexOf(l);
      const reg: Record<string, string | number> = { vendedor_id: l.vendedorId };
      for (const m of METRICAS_EDITAVEIS) {
        const n = m.tipo === "int" ? parseInteiro(l.campos[m.chave]) : parseEur(l.campos[m.chave]);
        if (n === null) erradas.add(`${i}:${m.chave}`);
        else reg[m.chave] = n;
      }
      return reg;
    });

    if (erradas.size > 0) {
      setInvalidas(erradas);
      setMsg({ tipo: "erro", texto: "Há valores inválidos (a vermelho)." });
      return;
    }

    setEtapa("guardando");
    setMsg(null);
    const r = await fetch("/api/upload-quadro/guardar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data, linhas: corpo }),
    }).catch(() => null);

    if (!r?.ok) {
      const j = await r?.json().catch(() => null);
      setMsg({ tipo: "erro", texto: j?.erro ?? "Erro ao guardar." });
      setEtapa("conferir");
      return;
    }
    setEtapa("ok");
    setMsg({ tipo: "ok", texto: `Guardado o dia ${dataCurta(data)} para ${corpo.length} vendedor(es).` });
  }

  function recomeçar() {
    setEtapa("inicial");
    setPreview(null);
    setBlob(null);
    setLinhas([]);
    setVendedores([]);
    setMsg(null);
    setInvalidas(new Set());
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-50 via-white to-emerald-50/40">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
            <IconeCamera />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              Lançar o dia pela foto
            </h1>
            <p className="text-sm text-zinc-500">
              A IA lê o quadro — você confere e confirma.
            </p>
          </div>
        </div>

        {/* Passos */}
        <ol className="mt-6 flex items-center gap-2">
          {PASSOS.map((p, i) => (
            <li key={p} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  i < passoAtivo
                    ? "bg-emerald-600 text-white"
                    : i === passoAtivo
                      ? "bg-emerald-600 text-white ring-4 ring-emerald-500/20"
                      : "bg-zinc-200 text-zinc-500"
                }`}
              >
                {i < passoAtivo ? <IconeCheck /> : i + 1}
              </span>
              <span
                className={`text-sm font-medium ${
                  i <= passoAtivo ? "text-zinc-800" : "text-zinc-400"
                }`}
              >
                {p}
              </span>
              {i < PASSOS.length - 1 && (
                <span
                  className={`ml-1 h-px flex-1 ${
                    i < passoAtivo ? "bg-emerald-500" : "bg-zinc-200"
                  }`}
                />
              )}
            </li>
          ))}
        </ol>

        {/* Mensagem */}
        {msg && (
          <div
            className={`mt-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              msg.tipo === "ok"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {msg.tipo === "ok" ? <IconeCheck /> : <IconeAlerta />}
            </span>
            <span>{msg.texto}</span>
          </div>
        )}

        {/* ---- Etapa final ---- */}
        {etapa === "ok" ? (
          <div className="mt-8 rounded-2xl border border-zinc-200/80 bg-white p-8 text-center shadow-sm">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <IconeCheckGrande />
            </span>
            <p className="mt-4 text-lg font-semibold text-zinc-900">Dia guardado!</p>
            <p className="mt-1 text-sm text-zinc-500">Os resultados já aparecem no painel.</p>
            <button
              type="button"
              onClick={recomeçar}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110"
            >
              <IconeCamera /> Enviar outra foto
            </button>
          </div>
        ) : (
          <>
            {/* ---- Upload ---- */}
            {etapa !== "conferir" && (
              <div className="mt-6">
                {!preview ? (
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setArrastando(true);
                    }}
                    onDragLeave={() => setArrastando(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setArrastando(false);
                      processarFicheiro(e.dataTransfer.files?.[0]);
                    }}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
                      arrastando
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-zinc-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/40"
                    }`}
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                      <IconeUpload />
                    </span>
                    <span className="mt-4 font-semibold text-zinc-800">
                      Toque para tirar ou escolher foto
                    </span>
                    <span className="mt-1 text-sm text-zinc-500">
                      ou arraste a imagem do quadro para aqui
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => processarFicheiro(e.target.files?.[0])}
                    />
                  </label>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt="Pré-visualização do quadro"
                        className="max-h-72 w-full object-contain bg-zinc-100"
                      />
                      {etapa === "analisando" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/70 text-emerald-600 backdrop-blur-sm">
                          <Spinner />
                          <span className="text-sm font-medium text-emerald-700">
                            A ler o quadro com IA…
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-zinc-100 p-3">
                      <label className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
                        Trocar foto
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          disabled={etapa === "analisando"}
                          onChange={(e) => processarFicheiro(e.target.files?.[0])}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={analisar}
                        disabled={etapa === "analisando"}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 font-medium text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110 disabled:opacity-50"
                      >
                        <IconeSparkles />
                        {etapa === "analisando" ? "A analisar…" : "Analisar foto"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---- Conferência ---- */}
            {(etapa === "conferir" || etapa === "guardando") && (
              <div className="mt-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
                  <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                    <IconeCalendario />
                    Data
                    <input
                      type="date"
                      value={data}
                      max={hoje}
                      onChange={(e) => e.target.value && setData(e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </label>
                  <span className="text-xs text-zinc-400">
                    Confira os valores lidos — corrija o que precisar.
                  </span>
                </div>

                {linhas.map((l, i) => (
                  <div
                    key={i}
                    className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
                      l.vendedorId ? "border-zinc-200/80" : "border-rose-300 ring-1 ring-rose-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={l.vendedorId}
                        onChange={(e) => editarVendedor(i, e.target.value)}
                        className={`flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 ${
                          l.vendedorId
                            ? "border-zinc-300 text-zinc-800 focus:border-emerald-500"
                            : "border-rose-400 text-rose-700"
                        }`}
                      >
                        <option value="">— escolher vendedor —</option>
                        {vendedores.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.nome}
                          </option>
                        ))}
                      </select>
                      {l.nome && (
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
                          quadro: {l.nome}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {METRICAS.map((m) => (
                        <div key={m.chave}>
                          <label className="mb-1 block text-[0.7rem] font-medium uppercase tracking-wide text-zinc-500">
                            {m.rotuloCurto}
                            {m.tipo === "eur" && <span className="ml-0.5 text-zinc-400">€</span>}
                          </label>
                          {m.tipo === "int" ? (
                            <IntInput
                              valor={l.campos[m.chave]}
                              onChange={(t) => editarCampo(i, m.chave, t)}
                              invalida={invalidas.has(`${i}:${m.chave}`)}
                            />
                          ) : (
                            <MoneyInput
                              valor={l.campos[m.chave]}
                              onChange={(t) => editarCampo(i, m.chave, t)}
                              invalida={invalidas.has(`${i}:${m.chave}`)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Ações */}
                <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:border-zinc-200/80 sm:shadow-sm">
                  <button
                    type="button"
                    onClick={guardar}
                    disabled={etapa === "guardando"}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:brightness-110 disabled:opacity-50 sm:flex-none"
                  >
                    {etapa === "guardando" ? <Spinner pequeno /> : <IconeCheck />}
                    {etapa === "guardando" ? "A guardar…" : "Confirmar e guardar"}
                  </button>
                  <button
                    type="button"
                    onClick={recomeçar}
                    disabled={etapa === "guardando"}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---- Ícones (SVG inline, sem dependências) ---- */

function IconeCamera() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconeUpload() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function IconeSparkles() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 4.8L18.6 8.6 13.8 10.4 12 15.2 10.2 10.4 5.4 8.6 10.2 6.8z" />
      <path d="M18 14l.9 2.4 2.4.9-2.4.9L18 20.6l-.9-2.4-2.4-.9 2.4-.9z" />
    </svg>
  );
}

function IconeCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconeCheckGrande() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconeAlerta() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconeCalendario() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function Spinner({ pequeno = false }: { pequeno?: boolean }) {
  const s = pequeno ? 16 : 28;
  return (
    <svg
      className="animate-spin"
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
