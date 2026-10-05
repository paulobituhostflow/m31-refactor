/**
 * Recuperação de rascunhos locais SEM abrir cada carta.
 *
 * Descobre cópias de QUALQUER aba (inclusive abas fechadas/reiniciadas, pois a
 * cópia vive no IndexedDB por autora+inscrição, não por aba) e sincroniza no
 * servidor as que estão coerentes. Conflitos (outra titular, outra versão,
 * inscrição fora da lista, editor ativo) ficam PRESERVADOS para revisão humana
 * ao abrir a carta — nunca aplicados automaticamente.
 *
 * Nunca concorre com um editor ativo: presença fresca (outra aba) ou editor
 * aberto nesta aba fazem a sincronização pular a inscrição.
 */
import { copiasDaAutora, removerCopiasDaInscricao, editoresAbertos } from './cartinhaDispositivo.js';
import { formatarCartinhaConcluida } from '../../../../worker/functions/m31Cartinhas/cartinhaPadrao.js';

const FRESCOR_PRESENCA_MS = 5 * 60 * 1000;

export async function sincronizarRascunhos({
  autoraId,
  inscricoes,
  salvar,
  abertosNestaAba = new Set(),
  agora = Date.now,
  descobrir = copiasDaAutora,
  remover = removerCopiasDaInscricao,
  lerPresencas = editoresAbertos,
  escopo = 'inscritas',
}) {
  const resultado = { sincronizados: 0, preservados: 0, erros: 0, limpos: 0, detalhes: [] };
  if (!autoraId || typeof salvar !== 'function' || !Array.isArray(inscricoes)) return resultado;
  const copias = await descobrir(autoraId).catch(() => []);
  if (!copias.length) return resultado;

  const presenca = lerPresencas(agora());
  // Uma cópia por inscrição: a MAIS RECENTE vence; as demais são descartáveis.
  const porInscricao = new Map();
  for (const copia of copias) {
    if (!copia?.inscricaoId) continue;
    if (escopo === 'inscritas' && copia.tipoDestinataria === 'voluntaria') continue;
    if (escopo === 'voluntarias' && copia.tipoDestinataria === 'inscrita') continue;
    const atual = porInscricao.get(copia.inscricaoId);
    if (!atual || String(copia.updatedAt || '') > String(atual.updatedAt || '')) porInscricao.set(copia.inscricaoId, copia);
  }

  for (const [inscricaoId, copia] of porInscricao) {
    if (abertosNestaAba.has(inscricaoId)) continue; // editor aberto nesta aba
    if (presenca[inscricaoId] && agora() - presenca[inscricaoId].ts <= FRESCOR_PRESENCA_MS) {
      resultado.preservados++; resultado.detalhes.push({ inscricaoId, motivo: 'editor_aberto_outra_aba' });
      continue;
    }
    const servidor = inscricoes.find(i => i.id === inscricaoId);
    if (!servidor) {
      resultado.preservados++; resultado.detalhes.push({ inscricaoId, motivo: 'inscricao_ausente_da_lista' });
      continue; // nunca apagar uma cópia cuja identidade não foi confirmada
    }
    if (copia.titularRef !== servidor.titular_ref) { // texto de OUTRA titular — revisão humana
      resultado.preservados++; resultado.detalhes.push({ inscricaoId, motivo: 'titular_divergente' });
      continue;
    }
    if (!copia.dirty && !copia.pending) { // cópia já sincronizada: só higieniza o dispositivo
      await remover(autoraId, inscricaoId).catch(() => {});
      resultado.limpos++;
      continue;
    }
    if (!copia.pending && copia.version !== servidor.cartinha_versao) { // versão divergiu — revisão humana
      resultado.preservados++; resultado.detalhes.push({ inscricaoId, motivo: 'versao_divergente' });
      continue;
    }
    // Coerente com o servidor: o mesmo envio que o autosave faria. UUID
    // pendente é reenviado exato — o servidor deduplica por id_transacao.
    const corpo = copia.pending || {
      inscricao_id: inscricaoId,
      texto: copia.text,
      status: copia.status === 'pendente' ? 'em_elaboracao' : copia.status,
      versao: copia.version,
      titular_ref: copia.titularRef,
      id_transacao: crypto.randomUUID(),
      suporte: copia.support || 'digital',
      ...(copia.support === 'fisica' && ['pronta', 'entregue'].includes(copia.status) ? { confirmar_fisica: true } : {}),
    };
    try {
      const atualizada = await salvar(corpo);
      const textoEsperado = atualizada?.cartinha_formato_versao === 1 && ['pronta', 'entregue'].includes(copia.status) && copia.support !== 'fisica'
        ? formatarCartinhaConcluida({ nomeCompleto: atualizada.nome, texto: copia.text }) : copia.text;
      if (atualizada?.id === inscricaoId && atualizada.cartinha_texto === textoEsperado &&
          atualizada.cartinha_status === (copia.status === 'pendente' ? 'em_elaboracao' : copia.status) &&
          (atualizada.cartinha_suporte || 'digital') === (copia.support || 'digital')) {
        await remover(autoraId, inscricaoId).catch(() => {});
        resultado.sincronizados++;
      } else if (copia.pending && copia.text !== corpo.texto && atualizada?.id === inscricaoId) {
        resultado.preservados++; resultado.detalhes.push({ inscricaoId, motivo: 'texto_local_mais_recente_que_envio' });
      } else {
        resultado.erros++;
      }
    } catch (error) {
      const status = error?.status || error?.response?.status;
      if (status === 409 || status === 422) resultado.preservados++; // servidor recusou: revisão humana
      else resultado.erros++;
    }
  }
  return resultado;
}