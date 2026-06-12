// Formatação e parsing pt-PT. Valores monetários circulam como number
// (euros com 2 decimais); arredondamento só acontece aqui.

const eurSemDecimais = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurCompleto = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inteiro = new Intl.NumberFormat("pt-PT");

/** "12 500 €" — para a TV (cêntimos são ruído a metros de distância). */
export function formatEurInteiro(v: number): string {
  return eurSemDecimais.format(v);
}

/** "12 500,00 €" — para o admin. */
export function formatEur(v: number): string {
  return eurCompleto.format(v);
}

export function formatInt(v: number): string {
  return inteiro.format(v);
}

/** Valor em € como texto editável: "1234,56" (sem símbolo, vírgula decimal). */
export function eurParaTexto(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

/**
 * Converte texto pt-PT em euros. Aceita "1.234,56", "1234,56", "1234.56",
 * "1 234,56" e "1.234" (ponto como separador de milhares). Vazio = 0.
 * Devolve null se o texto não for um valor válido.
 */
export function parseEur(texto: string): number | null {
  const t = texto.trim().replace(/[\s€]/g, "");
  if (t === "") return 0;
  if (!/^[\d.,]+$/.test(t)) return null;

  const ultimaVirgula = t.lastIndexOf(",");
  const ultimoPonto = t.lastIndexOf(".");
  let normalizado: string;

  if (ultimaVirgula === -1 && ultimoPonto === -1) {
    normalizado = t;
  } else {
    const idx = Math.max(ultimaVirgula, ultimoPonto);
    const parteInteira = t.slice(0, idx).replace(/[.,]/g, "");
    const parteDecimal = t.slice(idx + 1);
    if (/^\d{1,2}$/.test(parteDecimal)) {
      normalizado = `${parteInteira || "0"}.${parteDecimal}`;
    } else if (/^\d{3}$/.test(parteDecimal) && idx === ultimoPonto) {
      // "1.234" → ponto como separador de milhares
      normalizado = parteInteira + parteDecimal;
    } else {
      return null;
    }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  const n = Number(normalizado);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Converte texto em inteiro ≥ 0. Vazio = 0. Devolve null se inválido. */
export function parseInteiro(texto: string): number | null {
  const t = texto.trim();
  if (t === "") return 0;
  if (!/^\d+$/.test(t)) return null;
  return Number(t);
}
