"use client";

import { useState } from "react";
import { eurParaTexto, parseEur } from "@/lib/formato";

interface Props {
  valor: string;
  onChange: (texto: string) => void;
  invalida?: boolean;
}

export default function MoneyInput({ valor, onChange, invalida }: Props) {
  const [erroLocal, setErroLocal] = useState(false);

  function aoSair() {
    const texto = valor.trim();
    if (texto === "") {
      setErroLocal(false);
      return;
    }
    const n = parseEur(texto);
    if (n === null) {
      setErroLocal(true);
    } else {
      setErroLocal(false);
      onChange(eurParaTexto(n));
    }
  }

  const comErro = invalida || erroLocal;

  return (
    <input
      type="text"
      inputMode="decimal"
      data-grade
      value={valor}
      placeholder="0,00"
      onChange={(e) => {
        setErroLocal(false);
        onChange(e.target.value);
      }}
      onBlur={aoSair}
      onFocus={(e) => e.target.select()}
      className={`w-full rounded-md border px-2 py-1.5 text-right tabular-nums outline-none focus:ring-2 ${
        comErro
          ? "border-red-400 ring-red-200 focus:ring-red-200"
          : "border-zinc-300 focus:border-zinc-500 focus:ring-zinc-200"
      }`}
    />
  );
}
