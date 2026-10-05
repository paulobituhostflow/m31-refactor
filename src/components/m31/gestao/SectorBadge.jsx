import {
  ShieldCheck, ScanLine, Coffee, Layers, Cpu,
  Sparkles, Aperture, Activity, AudioLines, HeartPulse,
  Calculator, HandHeart, Users, Bus, ShoppingBag, Siren, Mic, Mic2,
  Truck, Clapperboard, Music, HeartHandshake,
} from 'lucide-react';
import { AREA_COLORS } from '@/lib/m31Areas';

// ── 7 áreas oficiais (nova taxonomia) — cor própria por área ──
const AREA_THEMES = {
  coordenacao:  { icon: ShieldCheck,     color: AREA_COLORS.coordenacao.solid,  bg: AREA_COLORS.coordenacao.soft  },
  inscricoes:   { icon: Users,           color: AREA_COLORS.inscricoes.solid,   bg: AREA_COLORS.inscricoes.soft   },
  logistica:    { icon: Truck,            color: AREA_COLORS.logistica.solid,    bg: AREA_COLORS.logistica.soft    },
  midia:        { icon: Clapperboard,     color: AREA_COLORS.midia.solid,        bg: AREA_COLORS.midia.soft        },
  lojinha:      { icon: ShoppingBag,       color: AREA_COLORS.lojinha.solid,     bg: AREA_COLORS.lojinha.soft      },
  louvor:       { icon: Music,             color: AREA_COLORS.louvor.solid,      bg: AREA_COLORS.louvor.soft       },
  intercessao:  { icon: HeartHandshake,    color: AREA_COLORS.intercessao.solid, bg: AREA_COLORS.intercessao.soft  },
};

// ── 18 setores legados (taxonomia antiga) — mantidos para compatibilidade ──
const LEGACY_SECTOR_THEMES = {
  coordenacao_geral: { icon: ShieldCheck, color: '#6366F1', bg: 'rgba(99, 102, 241, 0.08)' },
  financeiro_admin: { icon: Calculator, color: '#0D9488', bg: 'rgba(13, 148, 136, 0.08)' },
  credenciamento_checkin: { icon: ScanLine, color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.08)' },
  recepcao_acolhimento: { icon: HandHeart, color: '#DB2777', bg: 'rgba(219, 39, 119, 0.08)' },
  alimentacao_cantina: { icon: Coffee, color: '#0EA5E9', bg: 'rgba(14, 165, 233, 0.08)' },
  voluntariado_escalas: { icon: Users, color: '#16A34A', bg: 'rgba(22, 163, 74, 0.08)' },
  caravanas_transporte: { icon: Bus, color: '#0891B2', bg: 'rgba(8, 145, 178, 0.08)' },
  lojinha_servicos: { icon: ShoppingBag, color: '#CA8A04', bg: 'rgba(202, 138, 4, 0.08)' },
  infraestrutura_logistica: { icon: Layers, color: '#F97316', bg: 'rgba(249, 115, 22, 0.08)' },
  sinalizacao_seguranca: { icon: Siren, color: '#DC2626', bg: 'rgba(220, 38, 38, 0.08)' },
  palco_producao: { icon: Mic, color: '#9333EA', bg: 'rgba(147, 51, 234, 0.08)' },
  estrutura_montagem_ti: { icon: Cpu, color: '#64748B', bg: 'rgba(100, 116, 139, 0.08)' },
  marketing: { icon: Sparkles, color: '#EC4899', bg: 'rgba(236, 72, 153, 0.08)' },
  midias_cobertura: { icon: Aperture, color: '#F43F5E', bg: 'rgba(244, 63, 94, 0.08)' },
  intercessao: { icon: Activity, color: '#06B6D4', bg: 'rgba(6, 182, 212, 0.08)' },
  louvor: { icon: AudioLines, color: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.08)' },
  sala_pastoral_lavapes: { icon: HeartPulse, color: '#10B981', bg: 'rgba(16, 185, 129, 0.08)' },
  preletoras_espaco_filhas: { icon: Mic2, color: '#A855F7', bg: 'rgba(168, 85, 247, 0.08)' },
};

// Merge: novas áreas têm prioridade sobre legado quando slug colide (ex: 'intercessao', 'louvor')
const SECTOR_THEMES = { ...LEGACY_SECTOR_THEMES, ...AREA_THEMES };

export function getAreaColor(slug) {
  const theme = AREA_THEMES[slug];
  return theme ? theme.color : '#94A3B8';
}

export default function SectorBadge({ areaSlug, size = 28, iconSize = 15 }) {
  const theme = SECTOR_THEMES[areaSlug] || { icon: Layers, color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.08)' };
  const IconComponent = theme.icon;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: `${size}px`, height: `${size}px`,
      borderRadius: '6px',
      backgroundColor: theme.bg,
      border: `1px solid ${theme.color}20`,
      flexShrink: 0,
    }}>
      <IconComponent size={iconSize} strokeWidth={1.75} style={{ color: theme.color }} />
    </div>
  );
}