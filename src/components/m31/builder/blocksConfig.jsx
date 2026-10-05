// Blocos disponíveis no construtor de landing pages
const BLOCK_TYPES = {
  hero: {
    label: 'Hero / Cabeçalho',
    icon: 'Layout',
    description: 'Título, subtítulo e CTA principal',
    defaultData: {
      badge: 'M31 Filhas · 2026',
      title: 'Uma noite que vai marcar sua história',
      subtitle: 'Junte-se a milhares de mulheres em uma experiência única.',
      cta_text: 'Quero minha vaga →',
      cta_url: '/m31-inscricao',
      hero_image: '',
      background: 'gradient',
      alignment: 'center',
    },
  },
  features: {
    label: 'Destaques / Benefícios',
    icon: 'Star',
    description: 'Grid de cards com ícones',
    defaultData: {
      title: 'O que você vai viver',
      columns: 3,
      items: [
        { icon: '✨', title: 'Adoração', text: 'Momentos intensos de louvor e adoração' },
        { icon: '🔥', title: 'Palavra', text: 'Ministrações que transformam vidas' },
        { icon: '💛', title: 'Comunhão', text: 'Conexão com milhares de mulheres' },
      ],
    },
  },
  cta_section: {
    label: 'Call to Action',
    icon: 'MousePointerClick',
    description: 'Seção de conversão com botão',
    defaultData: {
      title: 'Garanta sua vaga agora',
      subtitle: 'Vagas limitadas. Não perca esta edição.',
      button_text: 'Quero me inscrever →',
      button_url: '/m31-inscricao',
      background: 'brand',
    },
  },
  video: {
    label: 'Vídeo / VSL',
    icon: 'Play',
    description: 'Embed de vídeo com botão com delay',
    defaultData: {
      title: 'Assista ao convite',
      embed_url: '',
      delay_seconds: 0,
      delay_cta_text: 'Quero participar →',
      delay_cta_url: '/m31-inscricao',
      aspect_ratio: '16:9',
    },
  },
  info_card: {
    label: 'Card de Informações',
    icon: 'Info',
    description: 'Data, local e preço em destaque',
    defaultData: {
      date: '14 de Junho de 2026',
      location: 'Recife, PE',
      address: '',
      price_display: 'A partir de R$ 90',
      style: 'cards',
    },
  },
  verse: {
    label: 'Versículo / Citação',
    icon: 'Quote',
    description: 'Frase de impacto com destaque',
    defaultData: {
      text: 'O Senhor é a minha luz e a minha salvação; a quem temerei?',
      reference: 'Salmos 27:1',
      style: 'elegant',
    },
  },
  testimonials: {
    label: 'Depoimentos',
    icon: 'MessageCircle',
    description: 'Grid de testemunhos',
    defaultData: {
      title: 'Quem já viveu',
      items: [
        { name: 'Maria Silva', text: 'Foi a melhor noite da minha vida!', photo: '' },
        { name: 'Ana Oliveira', text: 'Uma experiência que toda mulher precisa viver.', photo: '' },
      ],
    },
  },
  divider: {
    label: 'Divisor',
    icon: 'Minus',
    description: 'Linha separadora entre blocos',
    defaultData: { style: 'simple', color: '#E5E7EB' },
  },
  footer: {
    label: 'Rodapé',
    icon: 'ArrowDown',
    description: 'Texto final e segurança',
    defaultData: {
      security_text: '🔒 Pagamento 100% seguro via Asaas',
      footer_text: 'M31 Filhas · Edição 2026 · Ju Beltrão',
    },
  },
  camisas_hero: {
    label: 'Lojinha — Banner Camisas',
    icon: 'Layout',
    description: 'Banner oficial da Lojinha de Camisas no topo da página (imagem)',
    defaultData: {
      banner_url: '/assets/d8b6b1f1a_E7FBA259-1F2F-4DEC-8DD3-C4ED91F9CAF9.png',
      subtitle: 'Selecione o modelo, a cor e o tamanho 💛',
    },
  },
  purchase_flow: {
    label: 'Lojinha — Fluxo de Compra',
    icon: 'MousePointerClick',
    description: 'Bloco funcional fixo da Lojinha: modelo/tamanho → dados → pagamento',
    defaultData: { note: 'Escolha o modelo e o tamanho → preencha seus dados → gere o Pix e finalize.' },
  },
  custom_html: {
    label: 'HTML Customizado',
    icon: 'Code',
    description: 'Bloco livre com HTML/CSS',
    defaultData: { html: '<div style="text-align:center;padding:40px"><p>Seu conteúdo aqui</p></div>' },
  },
};

const FALLBACK_LANDING_FLAT = {
  badge: 'M31 Filhas · 2026',
  title: 'Uma noite que vai marcar sua história',
  subtitle: 'Junte-se a milhares de mulheres em uma experiência única de fé, adoração e transformação.',
  verse: 'O Senhor é a minha luz e a minha salvação; a quem temerei?',
  verse_ref: 'Salmos 27:1',
  date: '14 de Junho de 2026',
  location: 'Recife, PE',
  price_display: 'A partir de R$ 90',
  cta_text: 'Quero minha vaga →',
  security_text: 'Pagamento 100% seguro',
  footer_text: 'M31 Filhas · Edição 2026 · Ju Beltrão',
  colors: { primary: '#8B1A2B', bg: '#F2D4BD', card: '#FFFFFF', text: '#1A1A1A', gold: '#C4A265' },
};

const DEFAULT_BLOCKS_V2 = [
  { id: 'block_1', type: 'hero', data: BLOCK_TYPES.hero.defaultData },
  { id: 'block_2', type: 'info_card', data: BLOCK_TYPES.info_card.defaultData },
  { id: 'block_3', type: 'verse', data: BLOCK_TYPES.verse.defaultData },
  { id: 'block_4', type: 'cta_section', data: BLOCK_TYPES.cta_section.defaultData },
  { id: 'block_5', type: 'footer', data: BLOCK_TYPES.footer.defaultData },
];

// Converte config plana antiga para blocos V2
function flatToBlocks(flat) {
  const blocks = [];
  let idx = 1;

  blocks.push({ id: `block_${idx++}`, type: 'hero', data: {
    badge: flat.badge, title: flat.title, subtitle: flat.subtitle,
    cta_text: flat.cta_text, cta_url: flat.cta_url || '/m31-inscricao',
    hero_image: flat.hero_image || '', background: 'gradient', alignment: 'center',
  }});

  if (flat.date || flat.location || flat.price_display) {
    blocks.push({ id: `block_${idx++}`, type: 'info_card', data: {
      date: flat.date, location: flat.location, address: flat.address || '',
      price_display: flat.price_display, style: 'cards',
    }});
  }

  if (flat.verse) {
    blocks.push({ id: `block_${idx++}`, type: 'verse', data: {
      text: flat.verse, reference: flat.verse_ref || '', style: 'elegant',
    }});
  }

  blocks.push({ id: `block_${idx++}`, type: 'cta_section', data: {
    title: flat.cta_text || 'Garanta sua vaga',
    subtitle: 'Vagas limitadas',
    button_text: flat.cta_text || 'Inscrever →',
    button_url: flat.cta_url || '/m31-inscricao',
    background: 'brand',
  }});

  blocks.push({ id: `block_${idx++}`, type: 'footer', data: {
    security_text: flat.security_text || '',
    footer_text: flat.footer_text || '',
  }});

  return { version: 2, colors: flat.colors || FALLBACK_LANDING_FLAT.colors, blocks };
}

// Garante que a config está em formato V2
function ensureV2(config) {
  if (!config || typeof config !== 'object') return { version: 2, colors: { primary: '#8B1A2B', bg: '#F2D4BD', card: '#FFFFFF', text: '#1A1A1A', gold: '#C4A265' }, blocks: DEFAULT_BLOCKS_V2 };
  if (config.version === 2 && Array.isArray(config.blocks)) return config;
  return flatToBlocks(config);
}

export { BLOCK_TYPES, DEFAULT_BLOCKS_V2, FALLBACK_LANDING_FLAT, ensureV2, flatToBlocks };