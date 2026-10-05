import { formatarCartinhaConcluida } from '../../../../worker/functions/m31Cartinhas/cartinhaPadrao.js';

// Transporte em lote reutiliza o mesmo salvar() individual, com versão e UUID.
// Nenhuma escrita em entidades diretamente pelo navegador.
export function prepararEnviosLote({ cartas, participantes, status, loteId, uuid = () => crypto.randomUUID() }) {
  if (!['pronta', 'em_elaboracao'].includes(status)) throw new Error('Escolha concluir ou salvar como rascunhos.');
  const selecionadas = cartas.filter(c => c.selecionar);
  if (!selecionadas.length || selecionadas.length > 100) throw new Error('Selecione de 1 a 100 cartinhas.');
  const ids = new Set();
  return selecionadas.map(c => {
    const p = participantes.find(p => p.id === c.inscricao_id);
    if (!p || !p.titular_ref) throw new Error('Escolha a destinatária de cada cartinha selecionada.');
    if (ids.has(p.id)) throw new Error('Há duas cartinhas selecionadas para a mesma participante. Confira antes de salvar.');
    ids.add(p.id);
    if (p.tem_texto || ['pronta', 'entregue'].includes(p.cartinha_status)) throw new Error('Uma participante já tem cartinha. Desmarque esse item e revise no editor.');
    if (p.conferir_destinataria && status === 'pronta') throw new Error('Uma destinatária precisa ser conferida antes de concluir.');
    if (typeof c.texto !== 'string' || !c.texto.trim() || c.texto.length > 50000) throw new Error('Confira o tamanho e o conteúdo das cartinhas selecionadas.');
    return { indice: c.indice, nome: p.nome, estado: 'aguardando', erro: '', payload: {
      inscricao_id: p.id, texto: c.texto, status, versao: p.cartinha_versao ?? 0,
      titular_ref: p.titular_ref, id_transacao: uuid(), lote_id: loteId, suporte: 'digital',
    } };
  });
}

export async function executarEnviosLote({ envios, salvar, persistir, onSaved, onProgress, continuar = () => true }) {
  const next = structuredClone(envios);
  // UUIDs e corpos precisam estar duráveis ANTES da primeira requisição.
  await persistir(next);
  for (const item of next) {
    if (!continuar() || !['aguardando', 'incerto'].includes(item.estado)) continue;
    try {
      const saved = await salvar(item.payload);
      if (saved?.id !== item.payload.inscricao_id || !Number.isSafeInteger(saved.cartinha_versao) || typeof saved.cartinha_texto !== 'string') throw new Error('Resposta incompleta.');
      const textoOriginal = item.payload.texto.replace(/\r\n?/g, '\n');
      const esperado = saved.cartinha_formato_versao === 1 && ['pronta', 'entregue'].includes(saved.cartinha_status)
        ? formatarCartinhaConcluida({ nomeCompleto: saved.nome || item.nome, texto: textoOriginal }) : textoOriginal;
      if (saved.cartinha_texto !== esperado) throw new Error('Conteúdo retornado não corresponde ao envio.');
      item.estado = saved.cartinha_status === item.payload.status ? 'salvo' : 'revisar';
      item.erro = item.estado === 'revisar' ? 'Texto salvo, mas precisa de revisão antes de concluir.' : '';
      onSaved?.(saved);
    } catch (error) {
      const status = error?.status || error?.response?.status;
      item.estado = [409, 422].includes(status) ? 'revisar' : 'incerto';
      item.erro = [409, 422].includes(status)
        ? 'A carta ou a destinatária mudou. O conteúdo original está preservado; revise no editor.'
        : status === 401 || status === 403 ? 'Entre novamente para continuar o lote.' : 'Sem confirmação do servidor. Tente novamente com o mesmo lote.';
      await persistir(next);
      onProgress?.(structuredClone(next));
      if (![409, 422].includes(status)) break; // Evita disparos repetidos em indisponibilidade.
      continue;
    }
    await persistir(next);
    onProgress?.(structuredClone(next));
  }
  return next;
}
