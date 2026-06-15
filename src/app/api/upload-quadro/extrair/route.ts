import { NextResponse, type NextRequest } from "next/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";
import { hojeLisboa } from "@/lib/datas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAMANHO_MAX = 8 * 1024 * 1024; // 8 MB
const MODELO = process.env.OPENAI_MODEL || "gpt-4o";

// Esquema de saída estruturada — o modelo é obrigado a devolver exatamente isto.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    data: {
      type: ["string", "null"],
      description: "Data do quadro em YYYY-MM-DD, ou null se ilegível/ausente.",
    },
    linhas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          nome: { type: "string", description: "Nome como escrito no quadro." },
          vendedor_id: {
            type: ["string", "null"],
            description: "id exato do vendedor conhecido correspondente, ou null.",
          },
          leads_contatados: { type: "integer" },
          video_agendadas: { type: "integer" },
          video_realizadas: { type: "integer" },
          sinal_recebido: { type: "integer" },
          vendas_presencial: { type: "number" },
        },
        required: [
          "nome",
          "vendedor_id",
          "leads_contatados",
          "video_agendadas",
          "video_realizadas",
          "sinal_recebido",
          "vendas_presencial",
        ],
      },
    },
  },
  required: ["data", "linhas"],
} as const;

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erro: "OPENAI_API_KEY não configurada no servidor." },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ erro: "Envio inválido." }, { status: 400 });
  }
  const ficheiro = form.get("file");
  if (!(ficheiro instanceof File)) {
    return NextResponse.json({ erro: "Nenhuma imagem enviada." }, { status: 400 });
  }
  if (!ficheiro.type.startsWith("image/")) {
    return NextResponse.json({ erro: "O ficheiro tem de ser uma imagem." }, { status: 400 });
  }
  if (ficheiro.size > TAMANHO_MAX) {
    return NextResponse.json({ erro: "Imagem demasiado grande (máx. 8 MB)." }, { status: 400 });
  }

  // Vendedores ativos — dados ao modelo para mapear os nomes do quadro.
  const supabase = criarClienteAdmin();
  const { data: vendedores, error: erroVend } = await supabase
    .from("vendedores")
    .select("id, nome")
    .eq("ativo", true)
    .order("ordem");
  if (erroVend) {
    return NextResponse.json({ erro: erroVend.message }, { status: 500 });
  }

  const base64 = Buffer.from(await ficheiro.arrayBuffer()).toString("base64");
  const dataUrl = `data:${ficheiro.type};base64,${base64}`;
  const hoje = hojeLisboa();

  const sistema = [
    "Você lê uma fotografia de um quadro branco manuscrito com a tabela diária de uma equipa de vendas.",
    "Cada linha é um vendedor; as colunas são, nesta ordem aproximada:",
    "Leads Contactados (inteiro), Vídeo Agendadas (inteiro), Vídeo Realizadas (inteiro), Sinal Recebido (quantidade inteira), Vendas Fechadas/Presencial (valor em euros).",
    'Pode existir uma coluna "Valor de Caixa" — IGNORE-A por completo.',
    'Algumas células estão escritas como "resultado / meta" (ex.: "5/10"). Use SEMPRE só o RESULTADO (o número da esquerda) e ignore a meta. Célula com um número só já é o resultado. Célula vazia/ilegível = 0.',
    'Vendas em euros: interprete o ponto como separador de milhar (ex.: "20.000" = 20000).',
    'IGNORE a linha de "Total".',
    `Hoje é ${hoje} (fuso Europe/Lisbon). Se houver uma data no quadro (ex.: "12/06"), devolva-a como YYYY-MM-DD usando o ano corrente; nunca uma data futura. Se não houver data legível, devolva null.`,
    "Mapeie cada nome ao vendedor conhecido mais próximo e devolva o seu id EXATO; se não tiver certeza, devolva vendedor_id null.",
    `Vendedores conhecidos (JSON): ${JSON.stringify(vendedores ?? [])}`,
  ].join("\n");

  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0,
        messages: [
          { role: "system", content: sistema },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extraia a tabela do quadro segundo as regras e devolva o JSON.",
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "quadro", strict: true, schema: SCHEMA },
        },
      }),
    });
  } catch {
    return NextResponse.json(
      { erro: "Falha ao contactar a IA. Tente novamente." },
      { status: 502 }
    );
  }

  if (!resposta.ok) {
    // Não vazar a chave nem o corpo bruto; logar no servidor para diagnóstico.
    const detalhe = await resposta.text().catch(() => "");
    console.error("OpenAI erro", resposta.status, detalhe.slice(0, 500));
    return NextResponse.json(
      { erro: "A IA não conseguiu processar a imagem." },
      { status: 502 }
    );
  }

  const json = (await resposta.json().catch(() => null)) as {
    choices?: { message?: { content?: string; refusal?: string } }[];
  } | null;
  const msg = json?.choices?.[0]?.message;
  if (msg?.refusal || !msg?.content) {
    return NextResponse.json(
      { erro: "A IA não conseguiu ler o quadro. Tente uma foto mais nítida." },
      { status: 502 }
    );
  }

  let extraido: { data: string | null; linhas: unknown[] };
  try {
    extraido = JSON.parse(msg.content);
  } catch {
    return NextResponse.json(
      { erro: "Resposta da IA ilegível. Tente novamente." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    data: extraido.data,
    linhas: extraido.linhas ?? [],
    vendedores: vendedores ?? [],
  });
}
