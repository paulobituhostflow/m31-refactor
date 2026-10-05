// BuilderFormsReais — lista e preview das páginas/formulários REAIS do sistema (ao vivo)
import { Globe, ExternalLink, FileText, Bus, Heart, PartyPopper } from 'lucide-react';

export const FORMS_REAIS = [
  { id: 'landing', nome: 'Landing Page M31', rota: '/m31', desc: 'Página pública do evento', icon: Globe },
  { id: 'inscricao', nome: 'Formulário de Inscrição', rota: '/m31-inscricao', desc: 'Inscrição pública geral', icon: FileText },
  { id: 'caravana', nome: 'Formulário de Caravana', rota: '/m31-caravana', desc: 'Inscrição via caravanas', icon: Bus },
  { id: 'servir', nome: 'Formulário Servir', rota: '/m31-servir', desc: 'Cadastro de voluntárias', icon: Heart },
  { id: 'obrigado', nome: 'Página de Obrigado', rota: '/obrigado', desc: 'Pós-inscrição / confirmação', icon: PartyPopper },
];

export function FormRealCard({ form, isActive, onSelect }) {
  const Icon = form.icon;
  return (
    <div onClick={onSelect}
      style={{
        background: isActive ? '#FFF5F7' : '#fff',
        border: `1.5px solid ${isActive ? '#8B1A2B' : '#E5E7EB'}`,
        borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
        transition: 'all 0.15s', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: '#F6E9EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={14} color="#8B1A2B" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{form.nome}</div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{form.desc}</div>
      </div>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} title="No ar" />
    </div>
  );
}

export default function BuilderFormsReaisPreview({ form }) {
  const url = `${window.location.origin}${form.rota}`;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>{form.nome}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{form.rota}</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid #D1FAE5', background: '#F0FDF4', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#16A34A' }}>
          <Globe size={13} /> No ar
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#8B1A2B', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          <ExternalLink size={14} /> Abrir em nova aba
        </a>
      </div>

      {/* Preview real ao vivo */}
      <div style={{ flex: 1, background: '#F3F4F6', padding: 16, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
        <iframe
          src={form.rota}
          title={form.nome}
          style={{ width: '100%', maxWidth: 480, height: '100%', border: '1px solid #E5E7EB', borderRadius: 16, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
        />
      </div>
    </div>
  );
}