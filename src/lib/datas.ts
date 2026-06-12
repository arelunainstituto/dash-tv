// Toda a lógica de datas usa o fuso Europe/Lisbon — nunca o fuso do
// dispositivo nem toISOString() (UTC), para "hoje" não virar antes/depois
// da meia-noite de Lisboa.

const fmtISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Data de hoje em Lisboa, formato YYYY-MM-DD. */
export function hojeLisboa(): string {
  return fmtISO.format(new Date());
}

/** Primeiro dia do mês de uma data YYYY-MM-DD. */
export function inicioDoMes(iso: string): string {
  return iso.slice(0, 8) + "01";
}

/** Soma n dias (n pode ser negativo) a uma data YYYY-MM-DD. */
export function addDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Soma n meses ao primeiro dia do mês de uma data YYYY-MM-DD. */
export function addMeses(iso: string, n: number): string {
  const [a, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 10);
}

/** Nome do mês em pt-PT, ex.: "Junho de 2026". */
export function nomeDoMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-PT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(a, m - 1, 1)));
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** Data por extenso em pt-PT, ex.: "12/06/2026". */
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Hora atual em Lisboa, ex.: "14:32" ou "14:32:05". */
export function horaLisboa(comSegundos = false): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit",
    minute: "2-digit",
    ...(comSegundos ? { second: "2-digit" } : {}),
  }).format(new Date());
}
