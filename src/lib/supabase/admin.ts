import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a service role key — ignora RLS. Todo o acesso a dados passa
// por aqui, sempre no servidor; o import de "server-only" quebra o build se
// este módulo for importado por um componente client.
export function criarClienteAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
