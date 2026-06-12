"use client";

interface Props {
  valor: string;
  onChange: (texto: string) => void;
  invalida?: boolean;
}

export default function IntInput({ valor, onChange, invalida }: Props) {
  return (
    <input
      type="text"
      inputMode="numeric"
      data-grade
      value={valor}
      placeholder="0"
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      onFocus={(e) => e.target.select()}
      className={`w-full rounded-md border px-2 py-1.5 text-right tabular-nums outline-none focus:ring-2 ${
        invalida
          ? "border-red-400 ring-red-200 focus:ring-red-200"
          : "border-zinc-300 focus:border-zinc-500 focus:ring-zinc-200"
      }`}
    />
  );
}
