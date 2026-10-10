import type { HandlerContext } from "../../runtime/types";

// Projeção pública mínima do lote vigente. Não expõe vagas, regras internas
// nem os demais lotes cadastrados.
export default async function handler(
  _req: Request,
  context: HandlerContext,
): Promise<Response> {
  try {
    const lotes = await context.client.asServiceRole.entities.EventoM31Lote.filter(
      { ativo: true },
      "-ordem",
      5,
    );
    const lote = Array.isArray(lotes) ? lotes[0] : null;
    const valor = Number(lote?.valor);

    if (!lote || !Number.isFinite(valor) || valor <= 0) {
      return Response.json(
        {
          error: "lote_ativo_indisponivel",
          mensagem: "Nenhum lote ativo com valor configurado no momento.",
        },
        { status: 503 },
      );
    }

    return Response.json({ id: lote.id, nome: lote.nome || "", valor });
  } catch (error) {
    return Response.json(
      {
        error: "falha_ao_ler_preco",
        mensagem:
          error instanceof Error ? error.message : "Erro ao ler o valor vigente.",
      },
      { status: 500 },
    );
  }
}
