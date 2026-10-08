// Regra de preço do Order Bump de camisa da inscrição — espelho do backend.
// 1 camisa: R$ 65,00 · 2 ou mais: R$ 60,00 por unidade.
export const CAMISA_PRECO_UNITARIO = 65;
export const CAMISA_PRECO_PROMOCIONAL = 60;
export const CAMISA_MINIMO_PROMOCAO = 2;

export function calcularCamisas(quantidade) {
  const qtd = Math.max(0, Number(quantidade) || 0);
  const unitario = qtd >= CAMISA_MINIMO_PROMOCAO ? CAMISA_PRECO_PROMOCIONAL : CAMISA_PRECO_UNITARIO;
  return {
    quantidade: qtd,
    unitario,
    subtotal: Math.round(qtd * unitario * 100) / 100,
    desconto: Math.round(qtd * (CAMISA_PRECO_UNITARIO - unitario) * 100) / 100,
  };
}

export function tipoCamisa(modelo, tipos) {
  return (tipos || []).find((t) => t.modelo === modelo) || null;
}

export function rotuloUnidade(unidade, tipos) {
  const tipo = tipoCamisa(unidade?.modelo, tipos);
  const nomeTipo = tipo?.nome || unidade?.modelo || '';
  const cores = tipo?.cores || [];
  const cor = cores.find((c) => c.cor === unidade?.cor);
  const partes = [nomeTipo];
  if (cor?.nome) partes.push(cor.nome);
  if (unidade?.tamanho) partes.push(unidade.tamanho);
  return partes.filter(Boolean).join(' · ');
}

// Só unidades completas entram no pedido: tipo, cor (quando há mais de uma) e tamanho.
export function validarUnidadesCamisa(unidades, tipos) {
  const lista = Array.isArray(unidades) ? unidades : [];
  if (lista.length === 0) return 'Adicione ao menos uma camisa ou desmarque a oferta.';
  for (let i = 0; i < lista.length; i += 1) {
    const unidade = lista[i];
    const tipo = tipoCamisa(unidade?.modelo, tipos);
    if (!tipo) return `Escolha o tipo da camisa ${i + 1}.`;
    if (Array.isArray(tipo.cores) && tipo.cores.length > 0 && !unidade?.cor) return `Escolha a cor da camisa ${i + 1}.`;
    if (!unidade?.tamanho) return `Escolha o tamanho da camisa ${i + 1}.`;
  }
  return null;
}