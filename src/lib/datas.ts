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

/** Segunda-feira da semana de uma data YYYY-MM-DD. */
export function inicioDaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  const dia = dt.getUTCDay(); // 0 = domingo
  dt.setUTCDate(dt.getUTCDate() - (dia === 0 ? 6 : dia - 1));
  return dt.toISOString().slice(0, 10);
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

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
function pascoaUTC(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

// Feriados de data fixa no Porto: nacionais de Portugal + São João (24/06).
const FERIADOS_FIXOS = new Set([
  "01-01", // Ano Novo
  "04-25", // Dia da Liberdade
  "05-01", // Dia do Trabalhador
  "06-10", // Dia de Portugal
  "06-24", // São João (feriado municipal do Porto)
  "08-15", // Assunção de Nossa Senhora
  "10-05", // Implantação da República
  "11-01", // Todos os Santos
  "12-01", // Restauração da Independência
  "12-08", // Imaculada Conceição
  "12-25", // Natal
]);

/** Feriado no Porto (nacionais + municipal; móveis: Sexta-feira Santa e Corpo de Deus). */
export function ehFeriadoPorto(iso: string): boolean {
  if (FERIADOS_FIXOS.has(iso.slice(5))) return true;
  const pascoa = pascoaUTC(Number(iso.slice(0, 4)));
  const sextaSanta = new Date(pascoa);
  sextaSanta.setUTCDate(pascoa.getUTCDate() - 2);
  const corpoDeus = new Date(pascoa);
  corpoDeus.setUTCDate(pascoa.getUTCDate() + 60);
  return (
    iso === sextaSanta.toISOString().slice(0, 10) ||
    iso === corpoDeus.toISOString().slice(0, 10)
  );
}

/** Dia útil no Porto: não é sábado, domingo nem feriado. */
export function ehDiaUtil(iso: string): boolean {
  const dia = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dia !== 0 && dia !== 6 && !ehFeriadoPorto(iso);
}

/** Nº de dias úteis entre duas datas YYYY-MM-DD (inclusive). */
export function diasUteisEntre(de: string, ate: string): number {
  let conta = 0;
  for (let d = de; d <= ate; d = addDias(d, 1)) {
    if (ehDiaUtil(d)) conta++;
  }
  return conta;
}

/** Nº de dias úteis de um mês ("YYYY-MM"). */
export function diasUteisDoMes(anoMes: string): number {
  const inicio = `${anoMes}-01`;
  return diasUteisEntre(inicio, addDias(addMeses(inicio, 1), -1));
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
