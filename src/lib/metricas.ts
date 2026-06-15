// Fonte única das métricas: a grade de entrada, a TV, o resumo e o upsert
// iteram este array. Adicionar/renomear métrica = editar aqui + alter table.

export type TipoMetrica = "int" | "eur";

export type ChaveMetrica =
  | "leads_contatados"
  | "video_agendadas"
  | "video_realizadas"
  | "sinal_recebido"
  | "vendas_presencial";

export interface Metrica {
  chave: ChaveMetrica;
  rotulo: string;
  rotuloCurto: string;
  tipo: TipoMetrica;
}

export const METRICAS: Metrica[] = [
  { chave: "leads_contatados", rotulo: "Leads Contatados", rotuloCurto: "Leads", tipo: "int" },
  { chave: "video_agendadas", rotulo: "Vídeo Agendadas", rotuloCurto: "Vídeo Agend.", tipo: "int" },
  { chave: "video_realizadas", rotulo: "Vídeo Realizadas", rotuloCurto: "Vídeo Realiz.", tipo: "int" },
  { chave: "sinal_recebido", rotulo: "Sinal Recebido", rotuloCurto: "Sinal", tipo: "int" },
  { chave: "vendas_presencial", rotulo: "Vendas Presencial", rotuloCurto: "Vendas Pres.", tipo: "eur" },
];

// Todas as métricas são editáveis (não há métricas derivadas).
export const METRICAS_EDITAVEIS = METRICAS;

export type Valores = Record<ChaveMetrica, number>;

export function valoresZerados(): Valores {
  return {
    leads_contatados: 0,
    video_agendadas: 0,
    video_realizadas: 0,
    sinal_recebido: 0,
    vendas_presencial: 0,
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
