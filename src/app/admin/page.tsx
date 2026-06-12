import { criarClienteAdmin } from "@/lib/supabase/admin";
import EntryGrid from "@/components/EntryGrid";

export const dynamic = "force-dynamic";

export default async function PaginaDiario() {
  const supabase = criarClienteAdmin();
  const { data: vendedores, error } = await supabase
    .from("vendedores")
    .select("id, nome, ativo, ordem")
    .eq("ativo", true)
    .order("ordem")
    .order("nome");

  if (error) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900">
        <h2 className="font-semibold">Base de dados não configurada</h2>
        <p className="mt-2 text-sm">
          Não foi possível ler a tabela <code>vendedores</code> (
          {error.message}). Execute o ficheiro{" "}
          <code>supabase/migrations/0001_init.sql</code> no SQL Editor do
          Supabase e recarregue esta página.
        </p>
      </div>
    );
  }

  return <EntryGrid vendedores={vendedores ?? []} />;
}
