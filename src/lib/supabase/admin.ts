import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a service role key — ignora RLS. Só pode ser usado em código
// de servidor (/api/tv); o import de "server-only" quebra o build se este
// módulo for importado por um componente client.
export function criarClienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
