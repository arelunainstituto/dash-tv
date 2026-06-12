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
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <TvBoard token={token ?? ""} />;
}
