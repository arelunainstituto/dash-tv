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

export default function UploadQuadro() {
  const [etapa, setEtapa] = useState<Etapa>("inicial");
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [data, setData] = useState(hojeLisboa);
  const [linhas, setLinhas] = useState<LinhaConferir[]>([]);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [invalidas, setInvalidas] = useState<Set<string>>(new Set());

  const hoje = hojeLisboa();

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-xl font-bold text-zinc-900">Lançar o dia pela foto do quadro</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Tire ou escolha uma foto do quadro. A IA lê os números; confira e confirme antes de guardar.
      </p>

      {msg && (
        <p
          className={`mt-4 rounded-md px-3 py-2 text-sm ${
            msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.texto}
        </p>
      )}

      {etapa === "ok" ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={recomeçar}
            className="rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700"
          >
            Enviar outra foto
          </button>
        </div>
      ) : (
        <>
          {/* Upload */}
          {etapa !== "conferir" && (
            <div className="mt-6">
              <label className="inline-block cursor-pointer rounded-md border border-zinc-300 bg-white px-5 py-2.5 font-medium text-zinc-800 hover:bg-zinc-50">
                {preview ? "Trocar foto" : "Escolher / tirar foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={aoEscolher}
                  disabled={etapa === "analisando"}
                />
              </label>
              {preview && (
                <div className="mt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Pré-visualização do quadro"
                    className="max-h-64 rounded-lg border border-zinc-200"
                  />
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={analisar}
                      disabled={etapa === "analisando"}
                      className="rounded-md bg-zinc-900 px-5 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
                    >
                      {etapa === "analisando" ? "A ler o quadro com IA…" : "Analisar foto"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conferência */}
          {etapa === "conferir" || etapa === "guardando" ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-zinc-600">
                  Data do lançamento{" "}
                  <input
                    type="date"
                    value={data}
                    max={hoje}
                    onChange={(e) => e.target.value && setData(e.target.value)}
                    className="ml-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
                  />
                </label>
                <span className="text-xs text-zinc-400">
                  Confira os valores lidos pela IA — corrija o que precisar.
                </span>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                      <th className="px-3 py-2.5 font-medium text-zinc-600">Vendedor</th>
                      {METRICAS.map((m) => (
                        <th key={m.chave} className="px-3 py-2.5 text-right font-medium text-zinc-600">
                          {m.rotuloCurto}
                          {m.tipo === "eur" && <span className="ml-1 text-zinc-400">€</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={i} className="border-b border-zinc-100">
                        <td className="px-3 py-2">
                          <select
                            value={l.vendedorId}
                            onChange={(e) => editarVendedor(i, e.target.value)}
                            className={`w-full rounded-md border bg-white px-2 py-1.5 text-sm ${
                              l.vendedorId ? "border-zinc-300" : "border-red-400"
                            }`}
                          >
                            <option value="">— escolher —</option>
                            {vendedores.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.nome}
                              </option>
                            ))}
                          </select>
                          {l.nome && (
                            <span className="mt-1 block text-xs text-zinc-400">
                              quadro: {l.nome}
                            </span>
                          )}
                        </td>
                        {METRICAS.map((m) => (
                          <td key={m.chave} className="px-2 py-1.5">
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
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={guardar}
                  disabled={etapa === "guardando"}
                  className="rounded-md bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  {etapa === "guardando" ? "A guardar…" : "Confirmar e guardar"}
                </button>
                <button
                  type="button"
                  onClick={recomeçar}
                  disabled={etapa === "guardando"}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
