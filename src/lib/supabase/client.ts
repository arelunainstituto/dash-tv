import { createBrowserClient } from "@supabase/ssr";

// Cliente para componentes client (login, grade de entrada, vendedores).
// Usa a anon key — o acesso real é decidido pelas políticas RLS.
export function criarClienteBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
