/** Padrão puro e compartilhado: sem SDK, IA, rede ou gravações. */
export const ASSINATURA_CARTINHA = 'Pra. Ju Beltrão';
export const TIPOS_INSCRITAS = Object.freeze(['publico_geral', 'caravana']);
export const ehInscritaDaMeta = row => TIPOS_INSCRITAS.includes(row?.tipo);
export const tipoDestinatariaCartinha = row => row?.tipo === 'voluntario' ? 'voluntaria' : ehInscritaDaMeta(row) ? 'inscrita' : null;
const norm = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

export function primeiroNomeCartinha(nomeCompleto) {
  if (typeof nomeCompleto !== 'string') return '';
  const token = nomeCompleto.normalize('NFC').trim().split(/\s+/u)[0] || '';
  return token ? token.charAt(0).toLocaleUpperCase('pt-BR') + token.slice(1).toLocaleLowerCase('pt-BR') : '';
}

// Apenas assinaturas conhecidas EM LINHA FINAL. Nunca substituir nomes no corpo.
const assinaturaFinal = /^(?:pra\.?\s+ju\s+beltr[aã]o|ju|juliana\s+beltr[aã]o|pra\.?\s+juliana\s+beltr[aã]o|pastora\s+juliana\s+beltr[aã]o)\s*[.!]?$/iu;
export function textoSemAssinaturaCartinha(texto) {
  if (typeof texto !== 'string') throw Object.assign(new Error('Texto inválido.'), { status: 422 });
  const linhas = texto.replace(/\r\n?/g, '\n').trimEnd().split('\n');
  while (linhas.length && assinaturaFinal.test(linhas[linhas.length - 1].trim())) {
    linhas.pop();
    while (linhas.length && !linhas[linhas.length - 1].trim()) linhas.pop();
  }
  return linhas.join('\n').trim();
}

/** O corpo é preservado; só o cabeçalho correspondente e a assinatura são padronizados. */
export function formatarCartinhaConcluida({ nomeCompleto, texto }) {
  const primeiro = primeiroNomeCartinha(nomeCompleto);
  if (!primeiro) throw Object.assign(new Error('Confirme o nome da destinatária antes de concluir.'), { status: 422 });
  let corpo = textoSemAssinaturaCartinha(texto);
  if (!corpo) throw Object.assign(new Error('A cartinha precisa de conteúdo além da assinatura.'), { status: 422 });
  corpo = corpo.replace(/\{\{\s*(?:primeiro_nome|nome)\s*\}\}/gu, primeiro);
  const linhas = corpo.split('\n');
  const primeira = linhas[0].trim();
  const saudacao = primeira.match(/^(Querida|Amada)\s+(.+?)[,!]?$/iu);
  if (saudacao) {
    const destinataria = saudacao[2].replace(/[,!]$/, '').trim();
    const reconhecida = [norm(nomeCompleto), norm(primeiro), 'filha', 'irmã', 'minha filha', 'minha irmã', 'amada filha', 'querida filha'].includes(norm(destinataria));
    // Não encobrir uma carta endereçada explicitamente a outra pessoa.
    if (!reconhecida) throw Object.assign(new Error('O nome na saudação difere da destinatária. Confira o texto antes de concluir.'), { status: 422 });
    linhas[0] = `${saudacao[1].charAt(0).toUpperCase()}${saudacao[1].slice(1).toLowerCase()} ${primeiro},`;
    corpo = linhas.join('\n');
  } else if ([norm(nomeCompleto), norm(primeiro)].includes(norm(primeira.replace(/[,!:]$/, '')))) {
    linhas[0] = `${primeiro},`;
    corpo = linhas.join('\n');
  } else {
    corpo = `Querida ${primeiro},\n\n${corpo}`;
  }
  const final = `${corpo.trimEnd()}\n\n${ASSINATURA_CARTINHA}`;
  if (final.length > 50000) throw Object.assign(new Error('O texto final excede 50 mil caracteres. Reduza o texto sem perder o original.'), { status: 422 });
  return final;
}
