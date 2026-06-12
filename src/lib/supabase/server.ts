import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components (layouts/páginas do admin), com a sessão
// lida dos cookies. setAll falha silenciosamente em Server Components —
// o refresh do token é feito pelo proxy (src/proxy.ts).
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component sem acesso de escrita aos cookies — ignorar.
          }
        },
      },
    }
  );
}
