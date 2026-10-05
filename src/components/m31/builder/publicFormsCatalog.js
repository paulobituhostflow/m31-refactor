// Catálogo dos formulários públicos editáveis no Landing & Form Builder (Builder 360).
// Cada formulário guarda sua config num registro EventPageConfig (event_key próprio),
// no campo form_json: { version: 2, banner, textos, campos, extras }.
// O merge SEMPRE parte dos defaults — config inválida/ausente nunca quebra a página pública.
// Campos protegidos (nome, WhatsApp, e-mail, CPF) nunca podem ser ocultados nem
// dispensados: o merge ignora violações salvas direto no banco.
import { base44 } from '@/api/base44Client';
import { mergeCores } from '@/lib/m31VisualTheme';

export const EXTRAS_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'select', label: 'Lista de opções' },
  { value: 'toggle', label: 'Sim / Não' },
  { value: 'textarea', label: 'Texto longo' },
];

const c = (label, opts = {}) => ({ label, placeholder: '', helper: '', visivel: true, obrigatorio: true, ...opts });

export const PUBLIC_FORMS = {
  inscricao: {
    key: 'form_inscricao',
    nome: 'Formulário de Inscrição',
    rota: '/m31-inscricao',
    protegidos: ['nome', 'whatsapp', 'email', 'cpf'],
    travas: {
      nome: ['visivel', 'obrigatorio'],
      whatsapp: ['visivel', 'obrigatorio'],
      email: ['visivel', 'obrigatorio'],
      cpf: ['visivel', 'obrigatorio'],
      comoConheceu: ['obrigatorio'],
      nomeIgreja: ['visivel'],
    },
    defaults: {
      version: 2,
      banner: {
        url: '/assets/3b4d7e32b_920c8fdf-398a-4abb-b08a-f783b7781b661.png',
        alt: 'M31 Filhas — Imersão · 21 de Novembro · Recife, PE',
      },
      textos: {
        aside_badge_prefixo: 'Público Geral · ',
        aside_title_a: 'Garanta sua',
        aside_title_em: 'vaga',
        aside_sub: 'Um encontro para renovar sua fé, conexões profundas e crescimento espiritual. Sua jornada começa aqui.',
        aside_meta_data: '21 de Novembro',
        aside_meta_hora: '8h às 19h',
        aside_meta_local: 'Igreja RIO Prado',
        mobile_meta_data: '21 Nov',
        mobile_meta_hora: '8h — 19h',
        mobile_meta_local: 'RIO Prado',
        form_sub: 'Preencha seus dados para confirmar sua participação no M31 Filhas.',
        sec_primeiros: 'Primeiros passos',
        sec_dados: 'Dados completos',
        sec_sobre: 'Mais sobre você',
        wpp_hint: 'DDD + número',
        lead_salvo: 'Seus dados foram salvos. Continue preenchendo para finalizar.',
        btn_submit: 'Confirmar e ir para pagamento →',
        btn_loading: 'Registrando',
        footer_seguranca: 'Pagamento processado com segurança · Pix, cartão ou boleto',
        footer_ajuda: 'Precisa de ajuda? Fale conosco',
        sucesso_titulo: 'Inscrição registrada',
        sucesso_texto: 'Seus dados foram salvos. Finalize o pagamento para garantir sua vaga no M31 Filhas.\n\nEnviamos o link também no seu WhatsApp.',
        sucesso_btn: 'Finalizar pagamento →',
        sucesso_suporte: 'Falar com suporte',
        powered: 'M31 Filhas · Edição 2026 · Ju Beltrão',
      },
      campos: {
        nome: c('Nome completo'),
        whatsapp: c('WhatsApp'),
        email: c('E-mail'),
        cpf: c('CPF'),
        cidade: c('Cidade'),
        estado: c('UF'),
        jaParticipou: c('Já participou de algum M31?'),
        comoConheceu: c('Como conheceu o M31?'),
        fazParteIgreja: c('Faz parte de alguma igreja?'),
        nomeIgreja: c('Nome da sua igreja', { placeholder: 'Nome da sua igreja *' }),
      },
    },
  },

  caravana: {
    key: 'form_caravana',
    nome: 'Formulário de Caravana',
    rota: '/m31-caravana',
    protegidos: ['nome', 'celular', 'email', 'cpf'],
    travas: {
      nome: ['visivel', 'obrigatorio'],
      celular: ['visivel', 'obrigatorio'],
      email: ['visivel', 'obrigatorio'],
      cpf: ['visivel', 'obrigatorio'],
      caravana: ['obrigatorio'],
    },
    defaults: {
      version: 2,
      banner: { url: '', alt: '' },
      textos: {
        badge: 'Inscrição de Caravana',
        title_a: 'Inscrição via',
        title_em: 'Caravana',
        sub: 'Exclusivo para participantes de caravanas cadastradas. Selecione sua caravana e preencha seus dados.',
        meta_data: '21 Nov',
        meta_hora: '8h — 19h',
        meta_local: 'Igreja RIO Prado',
        rotulo: 'CARAVANA',
        card_label: 'Caravana · Inscrição Individual',
        card_title: 'Preencha seus dados',
        price_sub: 'Desconto caravana',
        sec_caravana: 'Sua caravana',
        caravana_fixa_prefixo: 'Você está se inscrevendo na caravana',
        caravanas_carregando: 'Carregando caravanas...',
        caravanas_vazio: 'Nenhuma caravana cadastrada. Entre em contato com o suporte.',
        sec_dados: 'Seus dados',
        sec_sobre: 'Mais sobre você',
        resumo_label: 'Inscrição via caravana',
        resumo_sub: 'Desconto aplicado',
        btn_submit: 'Confirmar e ir para pagamento →',
        btn_preencha_prefixo: 'Preencha',
        btn_preencha_sufixo: 'para continuar',
        sucesso_titulo: 'Inscrição registrada!',
        sucesso_texto: 'Seus dados foram salvos com sucesso.\n\nFinalize o pagamento para confirmar sua vaga na caravana {caravana}.\n\nO link também foi enviado no seu WhatsApp.',
        sucesso_btn: 'Finalizar pagamento →',
        sucesso_suporte: 'Precisa de ajuda? Fale com o Suporte',
        footer_suporte: 'Dúvidas? Fale com o Suporte M31',
        footer_seguranca: 'Dados protegidos · Pagamento via ASAAS',
        powered: 'M31 Filhas · Edição 2026 · Ju Beltrão',
      },
      campos: {
        nome: c('Nome completo'),
        apelido: c('Como gostaria de ser chamada?', { obrigatorio: false }),
        celular: c('WhatsApp (com DDD)'),
        email: c('E-mail'),
        cpf: c('CPF'),
        nascimento: c('Data de nascimento', { obrigatorio: false }),
        igreja: c('Igreja / Comunidade', { obrigatorio: false }),
        caravana: c('Selecione sua caravana'),
        jaParticipou: c('Já participou de algum M31?', { obrigatorio: false }),
        comoConheceu: c('Como conheceu o M31?', { obrigatorio: false }),
      },
    },
  },

  servir: {
    key: 'form_servir',
    nome: 'Formulário Servir',
    rota: '/m31-servir',
    protegidos: ['nome', 'celular', 'email', 'cpf'],
    travas: {
      nome: ['visivel', 'obrigatorio'],
      celular: ['visivel', 'obrigatorio'],
      email: ['visivel', 'obrigatorio'],
      cpf: ['visivel', 'obrigatorio'],
      setor: ['visivel', 'obrigatorio'],
      serviu_antes: ['obrigatorio'],
      tamanho_camisa: ['visivel', 'obrigatorio'],
    },
    defaults: {
      version: 2,
      banner: { url: '', alt: '' },
      blocos: { doacao: true },
      textos: {
        kicker: 'M31 Servir · Voluntários 2026',
        header_title_a: 'Nem todas estarão no palco.',
        header_title_b: 'Mas todas farão parte.',
        header_sub: 'Junte-se à equipe que torna o M31 possível. Escolha uma área e sirva conosco.',
        rotulo: 'VOLUNTÁRIOS',
        etapa1_titulo: 'Vamos conhecer você',
        etapa1_sub: 'Conte-nos um pouco sobre você',
        etapa2_titulo: 'Seu chamado',
        etapa2_sub: 'Como você quer servir?',
        etapa3_titulo: 'Quase lá',
        etapa3_sub: 'Confira tudo e finalize.',
        sec_dados: 'Informações básicas',
        sec_chamado: 'Onde você quer servir?',
        sec_camisa: 'Tamanho da camisa',
        camisa_help: 'Obrigatório para todos os voluntários.',
        serviu_pergunta: 'Já serviu em algum M31?',
        doar_titulo: 'Quero doar uma camisa',
        doar_desc: 'Presenteie uma voluntária com uma camisa. +R$ {valor}',
        doacao_pergunta: 'Para quem vai a camisa doada?',
        doacao_op1_label: 'Uma voluntária específica',
        doacao_op1_desc: 'Escolho a destinatária',
        doacao_op2_label: 'A liderança pode direcionar',
        doacao_op2_desc: 'Para quem mais precisar',
        doacao_campo_nome: 'Nome da voluntária',
        doacao_campo_wpp: 'WhatsApp (opcional)',
        doacao_campo_tamanho: 'Tamanho (opcional)',
        resumo_titulo: 'Resumo',
        resumo_quem: 'Quem é você',
        resumo_voluntariado: 'Voluntariado',
        total_label: 'Total final',
        btn_concluir_camisa: 'Concluir cadastro →',
        btn_proximo: 'Próximo passo →',
        btn_voltar: '← Voltar',
        btn_voltar_editar: '← Voltar e editar',
        btn_submit: 'Confirmar inscrição e pagar →',
        btn_loading: 'Enviando',
        sucesso_titulo: 'Cadastro enviado!',
        sucesso_texto: 'Recebemos suas informações para o M31 Servir.\n\nAgora finalize o pagamento para confirmar sua vaga na equipe de voluntários.\n\nEm breve entraremos em contato com mais orientações. 🤍',
        sucesso_camisa_titulo: 'Cadastro concluído!',
        sucesso_camisa_texto: 'Sua inscrição no M31 Servir está confirmada e já registramos o tamanho da sua camisa.\n\nEm breve entraremos em contato com mais orientações. 🤍',
        completo_titulo: 'Tudo certo com você!',
        completo_texto: 'Sua inscrição no M31 Servir já está confirmada e seu cadastro está completo, incluindo o tamanho da camisa.\n\nNão é necessário fazer nada agora. Em breve entraremos em contato com mais orientações. 🤍',
        socamisa_titulo: 'Sua inscrição já está confirmada!',
        socamisa_texto: 'Só precisamos do tamanho da sua camisa para concluir seu cadastro de voluntária.',
        sucesso_btn_pagar: 'Finalizar pagamento →',
        suporte_link: 'Dúvidas? Fale com a gente',
        powered: 'M31 Filhas · Edição 2026 · Ju Beltrão',
      },
      campos: {
        nome: c('Nome completo'),
        celular: c('WhatsApp'),
        email: c('E-mail'),
        cpf: c('CPF'),
        setor_intercessao: c('Intercessão', { helper: 'Oração e cobertura espiritual' }),
        setor_voluntario_geral: c('Voluntário Geral', { helper: 'Demais setores do evento' }),
        tamanho_camisa: c('Tamanho da camisa'),
      },
    },
  },

  obrigado: {
    key: 'form_obrigado',
    nome: 'Página de Obrigado',
    rota: '/obrigado',
    protegidos: [],
    travas: {},
    defaults: {
      version: 2,
      banner: { url: '', alt: '' },
      textos: {
        icone: '✅',
        titulo: 'Inscrição confirmada!',
        texto: 'Sua vaga está garantida. Entre no grupo para receber todas as informações.',
        cta_texto: 'ENTRAR NO GRUPO M31',
        cta_url: 'https://chat.whatsapp.com/LpgGi4hOZ9pBygWDorsiX1',
        footer: 'M31 Filhas · Edição 2026',
      },
      campos: {},
    },
  },
};

// ── Merge: defaults + config salva (sempre seguro) ──────────────────────────────
export function mergeFormConfig(formId, saved) {
  const def = PUBLIC_FORMS[formId];
  const d = def.defaults;
  const out = { version: 2, banner: { ...d.banner }, textos: { ...d.textos }, blocos: { ...(d.blocos || {}) }, campos: {}, extras: [], cores: mergeCores(formId, saved?.cores) };
  if (!saved || typeof saved !== 'object') return out;
  if (typeof saved.banner?.url === 'string' && saved.banner.url) {
    out.banner = { url: saved.banner.url, alt: typeof saved.banner.alt === 'string' ? saved.banner.alt : (d.banner.alt || '') };
  }
  for (const k of Object.keys(d.textos)) {
    if (typeof saved.textos?.[k] === 'string') out.textos[k] = saved.textos[k];
  }
  for (const [k, v] of Object.entries(d.blocos || {})) {
    if (typeof saved.blocos?.[k] === 'boolean') out.blocos[k] = saved.blocos[k];
  }
  for (const [id, meta] of Object.entries(d.campos)) {
    const s = saved.campos?.[id] || {};
    const merged = { ...meta };
    for (const asp of ['label', 'placeholder', 'helper']) {
      if (typeof s[asp] === 'string' && s[asp].trim()) merged[asp] = s[asp];
    }
    const travas = def.travas?.[id] || [];
    if (!travas.includes('visivel') && typeof s.visivel === 'boolean') merged.visivel = s.visivel;
    if (!travas.includes('obrigatorio') && typeof s.obrigatorio === 'boolean') merged.obrigatorio = s.obrigatorio;
    out.campos[id] = merged;
  }
  if (Array.isArray(saved.extras)) {
    out.extras = saved.extras
      .filter((f) => f && f.id && f.name && f.label && EXTRAS_TYPES.some((t) => t.value === f.type))
      .map((f) => ({ id: String(f.id), name: String(f.name), type: f.type, label: String(f.label), placeholder: String(f.placeholder || ''), helper: String(f.helper || ''), required: !!f.required, options: Array.isArray(f.options) ? f.options.filter(Boolean) : [] }));
  }
  return out;
}

export async function loadFormConfig(formId) {
  const def = PUBLIC_FORMS[formId];
  try {
    const list = await base44.entities.EventPageConfig.filter({ event_key: def.key }, '-updated_date', 1);
    return mergeFormConfig(formId, list?.[0]?.form_json);
  } catch {
    return mergeFormConfig(formId, null);
  }
}

// ── Validação do editor (bloqueia salvar) ──────────────────────────────────────
export function validateFormConfig(formId, cfg) {
  const def = PUBLIC_FORMS[formId];
  if (!cfg || cfg.version !== 2) return 'Configuração inválida.';
  for (const id of def.protegidos) {
    if (!cfg.campos?.[id]) return `O campo essencial "${id}" não pode ser removido.`;
    if (cfg.campos[id].visivel === false || cfg.campos[id].obrigatorio === false) {
      return `O campo essencial "${cfg.campos[id].label || id}" é obrigatório e fixo.`;
    }
    if (!String(cfg.campos[id].label || '').trim()) return `Informe o rótulo do campo essencial "${id}".`;
  }
  if (Object.keys(cfg.campos || {}).length === 0 && Object.keys(def.defaults.campos).length > 0) return 'O formulário precisa de pelo menos um campo.';
  const nomes = new Set();
  for (const f of cfg.extras || []) {
    if (!f.label?.trim()) return 'Todo campo personalizado precisa de um rótulo.';
    if (nomes.has(f.name)) return 'Dois campos personalizados com o mesmo nome interno.';
    nomes.add(f.name);
    if (f.type === 'select' && (!f.options || f.options.length === 0)) return `O campo "${f.label}" precisa de opções.`;
  }
  return null;
}

// ── Serialização dos campos personalizados para persistência segura ────────────
export function serializarExtras(extras, valores = {}) {
  return (extras || [])
    .map((f) => {
      const v = String(valores?.[f.id] ?? '').trim();
      return v ? `${f.label}: ${v}` : null;
    })
    .filter(Boolean)
    .join(' | ');
}

export function humanize(chave) {
  return String(chave)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}