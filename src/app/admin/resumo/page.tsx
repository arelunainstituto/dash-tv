import Link from "next/link";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import {
  METRICAS,
  valoresZerados,
  type Lancamento,
  type Valores,
  type Vendedor,
} from "@/lib/metricas";
import { addMeses, hojeLisboa, inicioDoMes, nomeDoMes } from "@/lib/datas";
import { formatEur, formatInt } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function PaginaResumo({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;
  const mesAtual = inicioDoMes(hojeLisboa());
  const inicio =
    mes && /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : mesAtual;
  const fim = addMeses(inicio, 1);

  const supabase = criarClienteAdmin();
  const [vend, lanc] = await Promise.all([
    supabase
      .from("vendedores")
      .select("id, nome, ativo, ordem")
      .order("ordem")
      .order("nome"),
    supabase
      .from("lancamentos_diarios")
      .select("*")
      .gte("data", inicio)
      .lt("data", fim),
  ]);

  if (vend.error || lanc.error) {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        Erro ao carregar o resumo:{" "}
        {vend.error?.message ?? lanc.error?.message}
      </p>
    );
  }

  const somas = new Map<string, Valores>();
  for (const linha of (lanc.data ?? []) as Lancamento[]) {
    const acc = somas.get(linha.vendedor_id) ?? valoresZerados();
    for (const m of METRICAS) acc[m.chave] += linha[m.chave];
    somas.set(linha.vendedor_id, acc);
  }

  // Aparece quem está ativo OU teve movimento no mês (mesma regra da TV).
  const visiveis = ((vend.data ?? []) as Vendedor[]).filter((v) => {
    const s = somas.get(v.id);
    return v.ativo || (s && METRICAS.some((m) => s[m.chave] > 0));
  });

  const totais = valoresZerados();
  for (const v of visiveis) {
    const s = somas.get(v.id);
    if (!s) continue;
    for (const m of METRICAS) totais[m.chave] += s[m.chave];
  }

  const mesAnterior = addMeses(inicio, -1).slice(0, 7);
  const mesSeguinte = addMeses(inicio, 1).slice(0, 7);
  const haSeguinte = inicio < mesAtual;

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href={`/admin/resumo?mes=${mesAnterior}`}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100"
        >
          ◀
        </Link>
        <h2 className="min-w-44 text-center text-lg font-semibold text-zinc-900">
          {nomeDoMes(inicio)}
        </h2>
        {haSeguinte ? (
          <Link
            href={`/admin/resumo?mes=${mesSeguinte}`}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100"
          >
            ▶
          </Link>
        ) : (
          <span className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm opacity-40">
            ▶
          </span>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
              <th className="px-3 py-2.5 font-medium text-zinc-600">
                Vendedor
              </th>
              {METRICAS.map((m) => (
                <th
                  key={m.chave}
                  className="px-3 py-2.5 text-right font-medium text-zinc-600"
                >
                  {m.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((v) => {
              const s = somas.get(v.id) ?? valoresZerados();
              return (
                <tr key={v.id} className="border-b border-zinc-100">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-800">
                    {v.nome}
                    {!v.ativo && (
                      <span className="ml-2 text-xs text-zinc-400">
                        (inativo)
                      </span>
                    )}
                  </td>
                  {METRICAS.map((m) => (
                    <td
                      key={m.chave}
                      className="px-3 py-2.5 text-right tabular-nums"
                    >
                      {m.tipo === "int"
                        ? formatInt(s[m.chave])
                        : formatEur(s[m.chave])}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr className="bg-zinc-50 font-semibold text-zinc-900">
              <td className="px-3 py-2.5">TOTAL</td>
              {METRICAS.map((m) => (
                <td
                  key={m.chave}
                  className="px-3 py-2.5 text-right tabular-nums"
                >
                  {m.tipo === "int"
                    ? formatInt(totais[m.chave])
                    : formatEur(totais[m.chave])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-zinc-400">
        Estes são os acumulados que aparecem no painel da TV.
      </p>
    </div>
  );
}
