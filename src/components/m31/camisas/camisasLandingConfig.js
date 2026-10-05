// Configuração de blocos da Lojinha — padrão Landing Page Builder (V2).
// A página pública (/camisas) lê os blocos do EventPageConfig (event_key m31_camisas);
// este fallback é usado enquanto o registro não existe.
import { base44 } from '@/api/base44Client';

export const CAMISAS_EVENT_KEY = 'm31_camisas';

export const DEFAULT_CAMISAS_BLOCKS = [
  { id: 'hero_1', type: 'camisas_hero', data: {
    subtitle: 'Selecione o modelo, a cor e o tamanho 💛',
  } },
  { id: 'flow_1', type: 'purchase_flow', data: {
    note: 'Escolha o modelo e o tamanho → preencha seus dados → gere o Pix e finalize.',
  } },
  { id: 'footer_1', type: 'footer', data: {
    security_text: '🔒 Pagamento 100% seguro via Asaas',
    footer_text: 'M31 Filhas · Camisas Oficiais · Edição 2026',
  } },
];

// Textos editáveis das etapas do fluxo de compra da Lojinha (Builder 360).
// A lógica financeira (preços, validação, dedup) permanece fixa no servidor.
export const DEFAULT_CAMISAS_TEXTOS = {
  selecao_titulo: 'Escolha suas camisas',
  selecao_item: 'Camisa',
  selecao_cor: 'Cor',
  selecao_tamanho: 'Tamanho',
  selecao_cada: 'cada',
  dados_titulo: 'Seus dados',
  dados_nome: 'Nome completo',
  dados_whatsapp: 'WhatsApp',
  dados_cpf: 'CPF',
  dados_email: 'E-mail',
  dados_opcional: '(opcional)',
  revisao_titulo: 'Revise seu pedido',
  revisao_item: 'Camisa',
  total_ajuda: 'Pagamento via Pix ou cartão de crédito em 1x',
  btn_pagar: 'Ir para pagamento →',
  btn_gerando: 'Preparando pagamento...',
  nota: 'Este formulário é exclusivo para compra de camisas. Não altera sua inscrição no M31.',
};

export async function loadCamisasTextos() {
  try {
    const list = await base44.entities.EventPageConfig.filter({ event_key: CAMISAS_EVENT_KEY }, '-updated_date', 1);
    const textos = list?.[0]?.form_json?.textos;
    if (textos && typeof textos === 'object') {
      return { ...DEFAULT_CAMISAS_TEXTOS, ...Object.fromEntries(Object.entries(textos).filter(([, v]) => typeof v === 'string')) };
    }
  } catch {
    // sem registro ou falha de leitura → usa o fallback
  }
  return { ...DEFAULT_CAMISAS_TEXTOS };
}

export async function loadCamisasLandingBlocks() {
  try {
    const list = await base44.entities.EventPageConfig.filter({ event_key: CAMISAS_EVENT_KEY }, '-updated_date', 1);
    const landing = list?.[0]?.landing_json;
    if (landing && landing.version === 2 && Array.isArray(landing.blocks) && landing.blocks.length > 0) {
      return landing.blocks;
    }
  } catch {
    // sem registro ou falha de leitura → usa o fallback abaixo
  }
  return DEFAULT_CAMISAS_BLOCKS;
}