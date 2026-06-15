import { METRICAS_EDITAVEIS } from "@/lib/metricas";

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

export interface ResultadoLimpeza {
  limpas?: Record<string, string | number>[];
  erro?: string;
}

// Valida e normaliza linhas para upsert em lancamentos_diarios. Cada linha
// precisa de vendedor_id (string), data (YYYY-MM-DD, não futura) e as métricas
// editáveis (>= 0; inteiras quando tipo "int"). Devolve { limpas } ou, na
// primeira linha inválida, { erro }. Partilhado por /api/dados e
// /api/upload-quadro/guardar para a regra de validação não divergir.
export function limparLinhasDia(
  linhas: unknown,
  hoje: string
): ResultadoLimpeza {
  if (!Array.isArray(linhas) || linhas.length === 0 || linhas.length > 100) {
    return { erro: "Linhas inválidas" };
  }
  const limpas: Record<string, string | number>[] = [];
  for (const linha of linhas as Record<string, unknown>[]) {
    if (typeof linha.vendedor_id !== "string") {
      return { erro: "vendedor_id inválido" };
    }
    if (
      typeof linha.data !== "string" ||
      !DATA_VALIDA.test(linha.data) ||
      linha.data > hoje
    ) {
      return { erro: "Data inválida ou no futuro" };
    }
    const limpa: Record<string, string | number> = {
      vendedor_id: linha.vendedor_id,
      data: linha.data,
    };
    for (const m of METRICAS_EDITAVEIS) {
      const v = linha[m.chave];
      if (
        typeof v !== "number" ||
        !Number.isFinite(v) ||
        v < 0 ||
        (m.tipo === "int" && !Number.isInteger(v))
      ) {
        return { erro: `Valor inválido em ${m.rotulo}` };
      }
      limpa[m.chave] = v;
    }
    limpas.push(limpa);
  }
  return { limpas };
}
