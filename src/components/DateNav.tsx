"use client";

import { addDias, hojeLisboa } from "@/lib/datas";

interface Props {
  data: string; // YYYY-MM-DD
  onChange: (novaData: string) => void;
}

export default function DateNav({ data, onChange }: Props) {
  const hoje = hojeLisboa();
  const noFuturo = data >= hoje;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(addDias(data, -1))}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100"
      >
        ◀ Anterior
      </button>
      <input
        type="date"
        value={data}
        max={hoje}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
      />
      <button
        type="button"
        disabled={noFuturo}
        onClick={() => onChange(addDias(data, 1))}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-white"
      >
        Seguinte ▶
      </button>
      <button
        type="button"
        disabled={data === hoje}
        onClick={() => onChange(hoje)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 disabled:hover:bg-white"
      >
        Hoje
      </button>
    </div>
  );
}
