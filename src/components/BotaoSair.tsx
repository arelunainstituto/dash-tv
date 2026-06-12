"use client";

import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";

export default function BotaoSair() {
  const router = useRouter();

  async function sair() {
    const supabase = criarClienteBrowser();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      className="rounded-md border border-zinc-300 px-3 py-1 text-zinc-600 hover:bg-zinc-100"
    >
      Sair
    </button>
  );
}
