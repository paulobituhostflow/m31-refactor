// Edição Visual 360 — tema de cores dos formulários públicos.
// Paleta do tema + cor por elemento, com merge seguro a partir dos padrões
// (identidade bordô M31). Consumido pelo Builder e pelas páginas públicas.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export const PALETA_CHAVES = [
  { id: 'marca', label: 'Cor da marca' },
  { id: 'fundo', label: 'Fundo da página' },
  { id: 'botao', label: 'Botão principal' },
  { id: 'texto', label: 'Texto principal' },
];

// Ajuste fino por elemento. Sem cor escolhida, o elemento segue a paleta
// (herda); 'rodape' sem escolha mantém o tom discreto atual da página.
export const ELEMENTOS_CORES = [
  { id: 'titulo', label: 'Títulos', herda: 'texto' },
  { id: 'realce', label: 'Realces e seleções', herda: 'marca' },
  { id: 'rodape', label: 'Rodapé' },
];

// Padrões por formulário — igual ao visual atual de cada página.
export const PALETA_PADRAO = {
  inscricao: { marca: '#8B1A2B', fundo: '#FFFFFF', botao: '#8B1A2B', texto: '#111827' },
  caravana: { marca: '#8B1A2B', fundo: '#FFFFFF', botao: '#8B1A2B', texto: '#111827' },
  servir: { marca: '#8B1A2B', fundo: '#FFFFFF', botao: '#8B1A2B', texto: '#111827' },
  obrigado: { marca: '#8B1A2B', fundo: '#0D0D0D', botao: '#8B1A2B', texto: '#F5F5F0' },
};

export function mergeCores(formId, saved) {
  const base = PALETA_PADRAO[formId] || PALETA_PADRAO.inscricao;
  const paleta = { ...base };
  const elementos = {};
  const s = saved && typeof saved === 'object' ? saved : {};
  for (const k of Object.keys(base)) {
    if (HEX.test(s.paleta?.[k] || '')) paleta[k] = s.paleta[k];
  }
  for (const el of ELEMENTOS_CORES) {
    const v = s.elementos?.[el.id];
    elementos[el.id] = HEX.test(v || '') ? v : '';
  }
  return { paleta, elementos };
}

// Cor final de um elemento: escolha própria → herança da paleta → indefinida
// (a página mantém o tom padrão do elemento).
export function corElemento(cores, id) {
  if (!cores) return undefined;
  if (cores.elementos?.[id]) return cores.elementos[id];
  const el = ELEMENTOS_CORES.find((e) => e.id === id);
  return el?.herda ? cores.paleta?.[el.herda] : undefined;
}

// Variáveis CSS aplicadas na raiz da página — consumidas pelo design system.
export function themeVars(cores) {
  if (!cores) return undefined;
  return {
    '--pgt-marca': cores.paleta?.marca,
    '--pgt-fundo': cores.paleta?.fundo,
    '--pgt-botao': cores.paleta?.botao,
    '--pgt-texto': cores.paleta?.texto,
    '--pgt-titulo': corElemento(cores, 'titulo'),
    '--pgt-realce': corElemento(cores, 'realce'),
    '--pgt-rodape': corElemento(cores, 'rodape'),
  };
}