import { cartinhasApi } from '../../../lib/m31CartinhasApi.js';

/** A sugestão fica no editor; não salva, conclui, envia ou alimenta referências. */
export async function solicitarSugestao({ inscricao, texto = '', modo, trecho, versao, titular_ref }) {
  const result = await cartinhasApi.sugerir({
    inscricao_id: inscricao.id, texto, modo, trecho,
    versao: versao ?? inscricao.cartinha_versao ?? 0,
    titular_ref: titular_ref ?? inscricao.titular_ref,
  });
  if (typeof result?.sugestao !== 'string' || !result.sugestao.trim()) throw new Error('Sugestão inválida.');
  return result.sugestao;
}
export function ocorreUmaVez(texto, trecho) {
  if (!trecho || !texto) return false;
  const index = texto.indexOf(trecho);
  return index !== -1 && index === texto.lastIndexOf(trecho);
}
export async function copilotoCorrigir({ texto, inscricao, versao, titular_ref }) {
  const corrigido = await solicitarSugestao({ inscricao, texto, modo:'corrigir', versao, titular_ref });
  return { textoBase:texto, sugestoes: corrigido === texto ? [] : [{
    id:'correcao-'+Date.now(), trecho_original:texto, trecho_corrigido:corrigido,
    motivo:'Revise as correções antes de aceitar.', status:'pendente',
  }] };
}
export async function copilotoComplementar({ antes='', depois='', inscricao, versao, titular_ref }) {
  return solicitarSugestao({ inscricao, texto:antes+depois, trecho:antes.slice(-6000), modo:'complementar', versao, titular_ref });
}
