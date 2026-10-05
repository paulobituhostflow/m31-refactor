import { ASSINATURA_CARTINHA, primeiroNomeCartinha, textoSemAssinaturaCartinha } from '../../../../worker/functions/m31Cartinhas/cartinhaPadrao.js';
export const MARCA_CARTINHAS = '/m31-cartinhas-marca.png';
const norm = value => String(value || '').normalize('NFC').trim().toLocaleLowerCase('pt-BR');

/** Projeção de impressão: não escreve nem migra dados históricos. */
export function normalizarCartinhaImpressao(raw) {
  const nomeCompleto = String(raw.nome || raw.participante_nome || raw.inscrita_nome || raw.nome_completo || '').trim();
  const primeiroNome = primeiroNomeCartinha(nomeCompleto);
  const texto = Array.isArray(raw.paragrafos) ? raw.paragrafos.join('\n\n') : String(raw.corpo || raw.cartinha_texto || raw.texto || raw.cartinha || '');
  let corpo = textoSemAssinaturaCartinha(texto);
  let saudacao = primeiroNome;
  const linhas = corpo.split('\n');
  const inicio = linhas[0]?.trim() || '';
  const match = inicio.match(/^(Querida|Amada)\s+(.+?)[,!]?$/iu);
  if (match && [norm(nomeCompleto), norm(primeiroNome)].includes(norm(match[2].replace(/[,!]$/, '')))) {
    saudacao = `${match[1].charAt(0).toUpperCase()}${match[1].slice(1).toLowerCase()} ${primeiroNome},`;
    corpo = linhas.slice(1).join('\n').trim();
  } else if ([norm(nomeCompleto), norm(primeiroNome)].includes(norm(inicio.replace(/[,!:]$/, '')))) {
    saudacao = `${primeiroNome},`;
    corpo = linhas.slice(1).join('\n').trim();
  }
  return {
    id: raw.id, codigo: raw.codigo_inscricao || raw.codigo || raw.id || '',
    nome: nomeCompleto, nomeCompleto, primeiroNome, saudacao,
    paragrafos: corpo.split(/\n{2,}/).map(p => p.trim()).filter(Boolean),
    assinatura: ASSINATURA_CARTINHA, tipo: raw.tipo,
  };
}
