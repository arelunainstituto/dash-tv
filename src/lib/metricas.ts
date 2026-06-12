// Fonte única das métricas: a grade de entrada, a TV, o resumo e o upsert
// iteram este array. Adicionar/renomear métrica = editar aqui + alter table.

export type TipoMetrica = "int" | "eur";

export type ChaveMetrica =
  | "leads_contatados"
  | "video_agendadas"
  | "video_realizadas"
  | "sinal_recebido"
  | "vendas_presencial"
  | "valor_em_caixa";

export interface Metrica {
  chave: ChaveMetrica;
  rotulo: string;
  rotuloCurto: string;
  tipo: TipoMetrica;
  /** Métrica derivada — não se digita; o valor é calculado. */
  calculada?: boolean;
}

export const METRICAS: Metrica[] = [
  { chave: "leads_contatados", rotulo: "Leads Contatados", rotuloCurto: "Leads", tipo: "int" },
  { chave: "video_agendadas", rotulo: "Vídeo Agendadas", rotuloCurto: "Vídeo Agend.", tipo: "int" },
  { chave: "video_realizadas", rotulo: "Vídeo Realizadas", rotuloCurto: "Vídeo Realiz.", tipo: "int" },
  { chave: "sinal_recebido", rotulo: "Sinal Recebido", rotuloCurto: "Sinal", tipo: "eur" },
  { chave: "vendas_presencial", rotulo: "Vendas Presencial", rotuloCurto: "Vendas Pres.", tipo: "eur" },
  // Valor em Caixa = Sinal Recebido + Vendas Presencial (sempre calculado)
  { chave: "valor_em_caixa", rotulo: "Valor em Caixa", rotuloCurto: "Caixa", tipo: "eur", calculada: true },
];

export const METRICAS_EDITAVEIS = METRICAS.filter((m) => !m.calculada);

/** Aplica as métricas derivadas: caixa = sinal + vendas. */
export function aplicarCalculadas(v: Valores): Valores {
  return { ...v, valor_em_caixa: v.sinal_recebido + v.vendas_presencial };
}

export type Valores = Record<ChaveMetrica, number>;

export function valoresZerados(): Valores {
  return {
    leads_contatados: 0,
    video_agendadas: 0,
    video_realizadas: 0,
    sinal_recebido: 0,
    vendas_presencial: 0,
    valor_em_caixa: 0,
  };
}

export interface Vendedor {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface Lancamento extends Valores {
  vendedor_id: string;
  data: string; // YYYY-MM-DD
}
