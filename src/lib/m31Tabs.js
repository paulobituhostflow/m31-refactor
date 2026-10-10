import {
  LayoutDashboard,
  AlertCircle,
  Activity,
  Users,
  UserCheck,
  Ticket,
  BadgePercent,
  Wallet,
  ClipboardCheck,
  Settings2,
  CalendarDays,
  Users2,
  FileText,
  Building2,
  CreditCard,
  Download,
  HeartHandshake,
  ScrollText,
  Wand2,
  ShieldAlert,
  ShieldCheck,
  Palette,
  MessageSquare,
  Zap,
  Clapperboard,
  Package,
} from 'lucide-react';

/**
 * ALL_TABS_CATEGORIZED — hierarquia do menu administrativo M31.
 *
 * permissao: chave correspondente a pode.[chave] em m31Auth.js
 */
export const ALL_TABS_CATEGORIZED = [
  {
    id: 'visao_geral',
    label: 'Visão Geral',
    icon: LayoutDashboard,
    items: [
      { id: 'home',      label: 'Home',                 icon: LayoutDashboard, permissao: 'any' },
      { id: 'dashboard', label: 'Dashboard Executivo', icon: LayoutDashboard, permissao: 'verDashboard' },
      { id: 'saude',     label: 'Saúde do Sistema',    icon: Activity,        permissao: 'verDashboard' },
    ],
  },
  {
    id: 'inscricoes',
    label: 'Inscrições',
    icon: Ticket,
    items: [
      { id: 'participantes', label: 'Inscritas & Caravanas',  icon: Users,          permissao: 'verParticipantes' },
      { id: 'config_evento', label: 'Configuração do Evento', icon: CalendarDays,   permissao: 'verLotes' },
      { id: 'voluntarios',   label: 'Voluntários',            icon: HeartHandshake, permissao: 'verVoluntariosHub' },
      { id: 'intercessao',   label: 'Intercessão',            icon: HeartHandshake, permissao: 'verIntercessao' },
      { id: 'checkin',       label: 'Check-in',               icon: UserCheck,      permissao: 'verParticipantes' },
    ],
  },
  {
    id: 'gestao',
    label: 'Gestão',
    icon: ClipboardCheck,
    items: [
      { id: 'tarefas',      label: 'Tarefas',             icon: ClipboardCheck, permissao: 'verTarefas' },
      { id: 'logistica',   label: 'Logística do Evento', icon: Package,        permissao: 'verTarefas' },
      { id: 'cronograma',   label: 'Cronograma',          icon: Clapperboard,   permissao: 'verDashboard' },
      { id: 'equipe',       label: 'Equipe',              icon: Users2,         permissao: 'verEquipe' },
      { id: 'cartinhas',    label: 'Cartinhas',           icon: ScrollText,     permissao: 'verTarefas' },

      { id: 'builder',      label: 'Landing & Form Builder', icon: Wand2,       permissao: 'configBot' },
      { id: 'operacoes',    label: 'Centro de Operações', icon: Zap,            permissao: 'verDashboard' },
    ],
  },
  {
    id: 'automacoes',
    label: 'Automações',
    icon: Zap,
    items: [
      { id: 'disparos',      label: 'Monitor WhatsApp',   icon: AlertCircle,   permissao: 'configBot' },
      { id: 'gestao_fluxos', label: 'Fluxos de Grupos',   icon: Users,        permissao: 'configBot' },
      { id: 'status_envios', label: 'Status dos Envios',  icon: MessageSquare, permissao: 'configBot' },
      { id: 'central_mensagens', label: 'Central de Mensagens', icon: MessageSquare, permissao: 'configBot' },
      { id: 'config_bot',    label: 'Configuração do Bot', icon: Settings2,    permissao: 'configBot' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    icon: Wallet,
    items: [
      { id: 'conciliacao', label: 'Conciliação Financeira', icon: ClipboardCheck, permissao: 'verFinanceiro' },
      { id: 'financeiro', label: 'Dashboard Financeiro', icon: Wallet,     permissao: 'verFinanceiro' },
      { id: 'transacoes', label: 'Transações',           icon: FileText,   permissao: 'verTransacoes' },
      { id: 'contas',     label: 'Contas a Pagar/Receber', icon: CreditCard, permissao: 'verContas' },
      { id: 'fornecedores', label: 'Fornecedores',        icon: Building2,      permissao: 'verFornecedores' },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    icon: Settings2,
    items: [
      { id: 'branding',  label: 'Branding',      icon: Palette,    permissao: 'configBot' },
      { id: 'auditoria', label: 'Auditoria',     icon: ShieldAlert, permissao: 'verDashboard' },
      { id: 'auditoria_grupos', label: 'Auditoria de Grupos', icon: ShieldAlert, permissao: 'verDashboard' },
      { id: 'logs',      label: 'Logs',          icon: ScrollText, permissao: 'verLogs' },
    ],
  },
];

/** Retorna todas as abas como lista plana */
export function flattenTabs() {
  return ALL_TABS_CATEGORIZED.flatMap(cat => cat.items);
}

/** Dado um tabId, retorna o id da categoria pai */
export function getCategoryForTab(tabId) {
  const cat = ALL_TABS_CATEGORIZED.find(c => c.items.some(i => i.id === tabId));
  return cat?.id ?? null;
}

/**
 * Filtra as tabs visíveis com base nas permissões do usuário.
 */
export function filterVisibleTabs({ isSuperAdmin, isCoordenador, pode }) {
  return ALL_TABS_CATEGORIZED
    .map(cat => ({
      ...cat,
      items: cat.items.filter(item => {
        if (item.permissao === 'any') return true;
        return !!pode?.[item.permissao];
      }),
    }))
    .filter(cat => cat.items.length > 0);
}
