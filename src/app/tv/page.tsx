import type { Metadata } from "next";
import TvBoard from "@/components/TvBoard";

export const metadata: Metadata = {
  title: "Relatório Comercial — Painel",
  // O token vai na URL; nunca o deixar vazar via header Referer.
  referrer: "no-referrer",
};

export default async function PaginaTv({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; periodo?: string }>;
}) {
  const { token, periodo } = await searchParams;
  const inicial =
    periodo === "semana" || periodo === "mes" ? periodo : "hoje";
  return <TvBoard token={token ?? ""} modoInicial={inicial} />;
}
