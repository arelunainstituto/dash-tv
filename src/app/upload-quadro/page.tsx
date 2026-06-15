import type { Metadata } from "next";
import UploadQuadro from "@/components/UploadQuadro";

export const metadata: Metadata = {
  title: "Lançar quadro — Relatório Comercial",
  robots: { index: false, follow: false },
};

export default function PaginaUploadQuadro() {
  return <UploadQuadro />;
}
