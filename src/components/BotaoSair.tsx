"use client";

export default function BotaoSair() {
  async function sair() {
    await fetch("/api/login", { method: "DELETE" }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <button
      data-sair
      onClick={sair}
      className="rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-600 hover:bg-zinc-100"
    >
      Sair
    </button>
  );
}
