import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, Trash2, Edit2, X, Users, Eye, EyeOff, LogIn, ChevronDown, ChevronRight,
  UserCheck,
} from 'lucide-react';
import { logAction } from '@/lib/m31Auth';
import M31SolicitacoesAcesso from '@/components/m31/M31SolicitacoesAcesso';
import { fmtTempoUso } from '@/hooks/useM31UsageTracker';
import EquipeSelector from '@/components/m31/equipe/EquipeSelector';
import { useEquipeFiltro } from '@/hooks/useEquipeFiltro';

// ── TOKENS ──────────────────────────────────────────────────
const T = {
  bg0: '#F5F6FA', bg1: '#FFFFFF', bg2: '#FFFFFF', bg3: '#F9FAFB', bg4: '#F9FAFB',
  text: '#1A1A1A', textSec: '#6B7280', textTer: '#9CA3AF',
  border: '#E5E7EB', borderSt: '#D1D5DB',
  brand: '#7A1F2B', brandHov: '#6B1A25',
  success: '#10B981', danger: '#EF4444', warning: '#F59E0B', info: '#3B82F6',
};

// ── PERFIS RBAC ──────────────────────────────────────────────
const PERFIS = [
  {
    value: 'super_admin',
    label: 'Super Admin',
    color: '#C4556A',
    desc: 'Acesso total: financeiro, exclusões, APIs, impersonação',
    icon: '👑',
  },
  {
    value: 'gestao_operacional',
    label: 'Gestão Operacional',
    color: '#60A5FA',
    desc: 'Inscrições, caravanas, voluntários, exportar. Sem delete/financeiro',
    icon: '⚙️',
  },
  {
    value: 'intercessao_operacional',
    label: 'Intercessão',
    color: '#A78BFA',
    desc: 'Somente painel e auditoria da Intercessão',
    icon: '🙏',
  },
  {
    value: 'lider_setor',
    label: 'Líder de Setor',
    color: '#34D399',
    desc: 'Apenas seu setor, presença e observações',
    icon: '🗂️',
  },
  {
    value: 'checkin',
    label: 'Check-in',
    color: '#FBBF24',
    desc: 'Interface simplificada: buscar participante e marcar entrada',
    icon: '✅',
  },
  // legados
  { value: 'coordenador',               label: 'Coordenador (legado)',        color: '#9CA3AF', desc: 'Acesso total — legado', icon: '📌' },
  { value: 'coordenadora_geral',        label: 'Coord. Geral (legado)',       color: '#9CA3AF', desc: 'Legado',                icon: '📌' },
  { value: 'gestora_inscricoes',        label: 'Gestora Inscrições (legado)', color: '#9CA3AF', desc: 'Legado',                icon: '📌' },
  { value: 'coordenacao_participantes', label: 'Coord. Participantes',        color: '#A78BFA', desc: 'Hub participantes, sem financeiro', icon: '👥' },
  { value: 'voluntario',                label: 'Voluntário',                  color: '#6B7280', desc: 'Permissões granulares',  icon: '🙌' },
];

const PERFIL_MAP = Object.fromEntries(PERFIS.map(p => [p.value, p]));

const SETORES = [
  { value: 'logistica',    label: 'Logística',            emoji: '🚛' },
  { value: 'comunicacao',  label: 'Comunicação',          emoji: '📸' },
  { value: 'voluntarios',  label: 'Voluntários',          emoji: '🙌' },
  { value: 'financeiro',   label: 'Financeiro',           emoji: '💰' },
  { value: 'checkin',      label: 'Check-in',             emoji: '✅' },
  { value: 'recepcao',     label: 'Recepção / Concierge', emoji: '🤵' },
  { value: 'oracao',       label: 'Oração / Intercessão', emoji: '🙏' },
  { value: 'geral',        label: 'Coordenação Geral',    emoji: '🗂️' },
];

const SETOR_MAP = Object.fromEntries(SETORES.map(s => [s.value, s]));

const DEFAULT_FORM = {
  user_email: '', nome: '', whatsapp: '',
  perfil: 'gestao_operacional', setor: 'geral', area: 'geral',
  pode_checkin: false, pode_ver_dashboard: false,
  pode_ver_inscricoes: false, pode_ver_financeiro: false,
  ativo: true,
};

const PERMS_LABEL = [
  { key: 'pode_ver_dashboard',  label: 'Ver Dashboard' },
  { key: 'pode_ver_inscricoes', label: 'Ver Inscrições' },
  { key: 'pode_checkin',        label: 'Fazer Check-in' },
  { key: 'pode_ver_financeiro', label: 'Ver Financeiro' },
];

// ── HELPERS ──────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── BADGE PERFIL ─────────────────────────────────────────────
function PerfilBadge({ perfil }) {
  const p = PERFIL_MAP[perfil] || { label: perfil, color: '#6B7280', icon: '?' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px',
      background: p.color + '20', color: p.color, whiteSpace: 'nowrap',
    }}>
      {p.icon} {p.label}
    </span>
  );
}

// ── STATUS BADGE ─────────────────────────────────────────────
function StatusBadge({ ativo }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px',
      background: ativo ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      color: ativo ? T.success : T.danger,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: ativo ? T.success : T.danger, display: 'inline-block' }} />
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  );
}

// ── ICON BTN ─────────────────────────────────────────────────
function Btn({ onClick, title, variant = 'ghost', disabled, children, small }) {
  const [h, setH] = useState(false);
  const colors = {
    ghost:   { bg: h ? T.bg4 : 'transparent', color: h ? T.text : T.textSec,  border: T.border },
    brand:   { bg: h ? T.brandHov : T.brand,  color: '#fff',                   border: T.brand },
    danger:  { bg: h ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.1)', color: T.danger, border: 'rgba(239,68,68,0.25)' },
    success: { bg: h ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.1)', color: T.success, border: 'rgba(16,185,129,0.25)' },
    warn:    { bg: h ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.1)', color: T.warning, border: 'rgba(245,158,11,0.25)' },
  };
  const c = colors[variant] || colors.ghost;
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
        padding: small ? '5px 10px' : '7px 14px',
        background: c.bg, border: `1px solid ${c.border}`, borderRadius: '6px',
        color: c.color, fontSize: small ? '11px' : '12px', fontWeight: '600',
        fontFamily: 'Inter, sans-serif', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all .12s', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >{children}</button>
  );
}

// ── MEMBRO CARD ───────────────────────────────────────────────
function MembroCard({ membro, isSuperAdmin, user, onEdit, onDelete, onToggle, onCopyLink, onImpersonate, onSendInvite }) {
  const [exp, setExp] = useState(false);
  const p = PERFIL_MAP[membro.perfil] || PERFIL_MAP.voluntario;
  const setor = SETOR_MAP[membro.setor || membro.area] || SETOR_MAP.geral;
  const link = `${window.location.origin}/m31-admin?email_override=${encodeURIComponent(membro.user_email)}`;

  return (
    <div style={{
      background: T.bg2, border: `1px solid ${T.border}`, borderRadius: '12px',
      overflow: 'hidden', transition: 'border-color .15s',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Avatar */}
        <div style={{
          width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
          background: p.color + '22', border: `2px solid ${p.color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px', fontWeight: '700', color: p.color,
          fontFamily: 'Inter, sans-serif',
        }}>
          {membro.nome?.[0]?.toUpperCase() || '?'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: T.text, fontFamily: 'Inter, sans-serif' }}>
            {membro.nome}
          </div>
          <div style={{ fontSize: '11px', color: T.textTer, marginTop: '2px' }}>
            {membro.user_email}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <PerfilBadge perfil={membro.perfil} />
          <StatusBadge ativo={membro.ativo !== false} />
          <button onClick={() => setExp(!exp)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTer, padding: '2px' }}>
            {exp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>
      </div>

      {/* Detalhes expandidos */}
      {exp && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '8px' }}>
            {[
              { label: 'Setor', value: `${setor.emoji} ${setor.label}` },
              { label: 'WhatsApp', value: membro.whatsapp || '—' },
              { label: 'Último acesso', value: fmtDate(membro.ultimo_acesso) },
              { label: 'Total acessos', value: membro.total_acessos || 0 },
              ...(isSuperAdmin ? [{ label: 'Tempo de uso', value: fmtTempoUso(membro.tempo_total_uso_minutos) }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ background: T.bg3, borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', color: T.textTer, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '3px' }}>{label}</div>
                <div style={{ fontSize: '12px', color: T.textSec }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Permissões granulares */}
          {membro.perfil === 'voluntario' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {PERMS_LABEL.map(p => (
                <span key={p.key} style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                  background: membro[p.key] ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.04)',
                  color: membro[p.key] ? T.success : T.textTer,
                }}>
                  {membro[p.key] ? '✓' : '✗'} {p.label}
                </span>
              ))}
            </div>
          )}

          {/* Ações */}
          {isSuperAdmin && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <Btn small onClick={() => onEdit(membro)} variant="ghost">
                <Edit2 size={12} /> Editar
              </Btn>
              <Btn small onClick={() => onSendInvite(membro)} variant="success">
                <UserPlus size={12} /> Enviar convite
              </Btn>
              <Btn small onClick={() => onToggle(membro)} variant={membro.ativo !== false ? 'warn' : 'success'}>
                {membro.ativo !== false ? <><EyeOff size={12} /> Desativar</> : <><Eye size={12} /> Ativar</>}
              </Btn>
              <Btn small onClick={() => onImpersonate(membro)} variant="ghost">
                <LogIn size={12} /> Entrar como
              </Btn>
              {membro.user_email !== user?.email && (
                <Btn small onClick={() => onDelete(membro)} variant="danger">
                  <Trash2 size={12} /> Remover
                </Btn>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── FORM MODAL ─────────────────────────────────────────────────
function MembroForm({ form, setForm, editing, onSave, onClose, isPending }) {
  const perfilAtual = PERFIL_MAP[form.perfil];
  const sel = {
    background: T.bg3, border: `1px solid ${T.border}`, borderRadius: '7px',
    color: T.text, fontFamily: 'Inter, sans-serif', fontSize: '13px',
    padding: '9px 12px', outline: 'none', width: '100%',
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: T.bg2, border: `1px solid ${T.borderSt}`, borderRadius: '12px', width: '100%', maxWidth: '540px', maxHeight: '88vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, fontFamily: 'Inter, sans-serif' }}>
            {editing ? 'Editar Membro' : 'Novo Membro'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSec }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Campos básicos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { key: 'nome',        label: 'Nome *',        placeholder: 'Nome completo' },
              { key: 'user_email',  label: 'Email *',       placeholder: 'email@exemplo.com' },
              { key: 'whatsapp',    label: 'WhatsApp',      placeholder: '(81) 99999-9999' },
            ].map(f => (
              <div key={f.key} style={{ gridColumn: f.key === 'nome' ? '1 / -1' : undefined }}>
                <label style={{ fontSize: '11px', color: T.textTer, display: 'block', marginBottom: '5px', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '.05em' }}>{f.label}</label>
                <input
                  value={form[f.key] || ''}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{ ...sel, height: '40px' }}
                />
              </div>
            ))}
          </div>

          {/* Perfil */}
          <div>
            <label style={{ fontSize: '11px', color: T.textTer, display: 'block', marginBottom: '5px', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '.05em' }}>Perfil RBAC *</label>
            <select value={form.perfil} onChange={e => setForm(p => ({ ...p, perfil: e.target.value }))} style={{ ...sel, height: '40px' }}>
              {PERFIS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
            </select>
            {perfilAtual && (
              <div style={{ fontSize: '11px', color: T.textTer, marginTop: '5px', padding: '6px 10px', background: T.bg3, borderRadius: '5px' }}>
                {perfilAtual.desc}
              </div>
            )}
          </div>

          {/* Setor */}
          <div>
            <label style={{ fontSize: '11px', color: T.textTer, display: 'block', marginBottom: '5px', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '.05em' }}>Setor / Área</label>
            <select value={form.setor || form.area || 'geral'} onChange={e => setForm(p => ({ ...p, setor: e.target.value, area: e.target.value }))} style={{ ...sel, height: '40px' }}>
              {SETORES.map(s => <option key={s.value} value={s.value}>{s.emoji} {s.label}</option>)}
            </select>
          </div>

          {/* Permissões granulares (só para voluntário) */}
          {form.perfil === 'voluntario' && (
            <div style={{ background: T.bg3, borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: T.textTer, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Permissões granulares</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {PERMS_LABEL.map(p => (
                  <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!form[p.key]} onChange={e => setForm(prev => ({ ...prev, [p.key]: e.target.checked }))} style={{ accentColor: T.brand }} />
                    <span style={{ fontSize: '12px', color: T.textSec, fontFamily: 'Inter, sans-serif' }}>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.ativo} onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))} style={{ accentColor: T.success }} />
            <span style={{ fontSize: '13px', color: T.textSec, fontFamily: 'Inter, sans-serif' }}>Usuário ativo</span>
          </label>

          {/* Botões */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
            <Btn onClick={onSave} variant="brand" disabled={!form.nome || !form.user_email || isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── IMPERSONATE MODAL ─────────────────────────────────────────
function ImpersonateModal({ membro, onConfirm, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={onClose}>
      <div style={{ background: T.bg2, border: `1px solid rgba(245,158,11,0.3)`, borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '24px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '16px', fontWeight: '700', color: T.warning, marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>
          ⚠️ Entrar como usuário
        </div>
        <div style={{ fontSize: '13px', color: T.textSec, lineHeight: '1.6', marginBottom: '20px' }}>
          Você está prestes a visualizar o sistema como <strong style={{ color: T.text }}>{membro.nome}</strong> ({membro.user_email}).
          <br /><br />
          Esta ação será registrada nos logs de auditoria.
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <Btn onClick={onClose} variant="ghost">Cancelar</Btn>
          <Btn onClick={onConfirm} variant="warn"><LogIn size={13} /> Confirmar</Btn>
        </div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────
export default function M31GestaoEquipe({ isSuperAdmin, user, membro: membroAtual }) {
  const qc = useQueryClient();
  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState(DEFAULT_FORM);
  const [editing, setEditing]             = useState(null);
  const [copied, setCopied]               = useState(false);
  const [impersonating, setImpersonating] = useState(null);
  const [filtroStatus, setFiltroStatus]   = useState('todos');
  const [filtroPerfil, setFiltroPerfil]   = useState('');
  const [busca, setBusca]                 = useState('');
  const [subTab, setSubTab]               = useState('membros');
  const [equipeAtiva, setEquipeAtiva]     = useState('geral');

  const { data: membros = [], isLoading } = useQuery({
    queryKey: ['m31membros'],
    queryFn: () => base44.entities.EventoM31Membro.list('-created_date', 200),
  });

  // Filtro por equipe (area/setor) — desacoplado da UI via hook customizado
  const { filtrados: filtradosPorEquipe } = useEquipeFiltro(membros, equipeAtiva);
  const kpis = useMemo(() => {
    const ativos = filtradosPorEquipe.filter(m => m.ativo !== false);
    const inativos = filtradosPorEquipe.filter(m => m.ativo === false);
    const porPerfil = {};
    filtradosPorEquipe.forEach(m => { porPerfil[m.perfil] = (porPerfil[m.perfil] || 0) + 1; });
    return { total: filtradosPorEquipe.length, ativos: ativos.length, inativos: inativos.length, porPerfil };
  }, [filtradosPorEquipe]);

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.EventoM31Membro.update(editing, data)
      : base44.entities.EventoM31Membro.create(data),
    onSuccess: async (_, variables) => {
      await logAction({
        user, membro: membroAtual,
        acao: editing ? `Editou membro: ${variables.nome}` : `Criou membro: ${variables.nome}`,
        modulo: 'equipe',
        entidade_nome: variables.nome,
      });
      qc.invalidateQueries(['m31membros']);
      setShowForm(false); setForm(DEFAULT_FORM); setEditing(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (m) => base44.entities.EventoM31Membro.delete(m.id),
    onSuccess: async (_, m) => {
      await logAction({ user, membro: membroAtual, acao: `Removeu membro: ${m.nome}`, modulo: 'equipe', entidade_nome: m.nome });
      qc.invalidateQueries(['m31membros']);
    }
  });

  const toggleMutation = useMutation({
    mutationFn: (m) => base44.entities.EventoM31Membro.update(m.id, { ativo: !m.ativo }),
    onSuccess: async (_, m) => {
      await logAction({ user, membro: membroAtual, acao: `${!m.ativo ? 'Ativou' : 'Desativou'} membro: ${m.nome}`, modulo: 'equipe', entidade_nome: m.nome });
      qc.invalidateQueries(['m31membros']);
    }
  });

  const handleEdit = (m) => { setForm({ ...DEFAULT_FORM, ...m }); setEditing(m.id); setShowForm(true); };

  const handleCopyLink = (link) => {
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };

  const handleImpersonate = async (m) => {
    await logAction({ user, membro: membroAtual, acao: `Impersonou usuário: ${m.nome} (${m.user_email})`, modulo: 'sistema', entidade_nome: m.nome, impersonado_por: user?.email });
    setImpersonating(null);
    window.open(`${window.location.origin}/m31-admin?impersonate=${encodeURIComponent(m.user_email)}`, '_blank');
  };

  const handleSendInvite = async (m) => {
    try {
      // Cria URL customizada com a rota de aceitação de convite
      const inviteUrl = `${window.location.origin}/m31-accept-invite?email=${encodeURIComponent(m.user_email)}`;
      // Copia para clipboard em vez de usar inviteUser que redireciona para página de vendas
      navigator.clipboard.writeText(inviteUrl);
      await logAction({ user, membro: membroAtual, acao: `Enviou convite para: ${m.nome} (${m.user_email})`, modulo: 'equipe', entidade_nome: m.nome });
      alert(`✓ Link de convite copiado!\n\n${inviteUrl}\n\nCompartilhe esse link com ${m.nome}`);
    } catch (e) {
      alert(`Erro ao copiar link: ${e.message}`);
    }
  };

  // Filtros aplicados sobre o subset da equipe ativa
  const filtrados = useMemo(() => {
    let list = filtradosPorEquipe;
    if (filtroStatus === 'ativos')   list = list.filter(m => m.ativo !== false);
    if (filtroStatus === 'inativos') list = list.filter(m => m.ativo === false);
    if (filtroPerfil)                list = list.filter(m => m.perfil === filtroPerfil);
    if (busca) {
      const b = busca.toLowerCase();
      list = list.filter(m => m.nome?.toLowerCase().includes(b) || m.user_email?.toLowerCase().includes(b));
    }
    return list;
  }, [filtradosPorEquipe, filtroStatus, filtroPerfil, busca]);

  const sel = {
    background: T.bg2, border: `1px solid ${T.border}`, borderRadius: '6px',
    color: T.textSec, fontFamily: 'Inter, sans-serif', fontSize: '12px',
    padding: '7px 12px', outline: 'none', cursor: 'pointer',
  };

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
      <div style={{ width: '28px', height: '28px', border: `2px solid ${T.border}`, borderTopColor: T.brand, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: T.text, display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Sub-abas internas: Membros | Solicitações */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: `1px solid ${T.border}` }}>
        {[
          { id: 'membros', label: 'Membros', icon: Users },
          { id: 'solicitacoes', label: 'Solicitações de Acesso', icon: UserCheck },
        ].map(st => (
          <button
            key={st.id}
            onClick={() => setSubTab(st.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 16px', fontSize: '13px', fontWeight: subTab === st.id ? '600' : '500',
              color: subTab === st.id ? T.brand : T.textSec,
              background: 'none', border: 'none', borderBottom: subTab === st.id ? `2px solid ${T.brand}` : '2px solid transparent',
              cursor: 'pointer', fontFamily: 'Inter, sans-serif', marginBottom: '-1px',
            }}
          >
            <st.icon size={14} /> {st.label}
          </button>
        ))}
      </div>

      {subTab === 'membros' && (
      <>
      {/* Seletor global de equipes */}
      <EquipeSelector equipeAtiva={equipeAtiva} setEquipeAtiva={setEquipeAtiva} />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0', background: T.bg2, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden' }}>
        {[
          { label: 'Total', value: kpis.total, color: T.text },
          { label: 'Ativos', value: kpis.ativos, color: T.success },
          { label: 'Inativos', value: kpis.inativos, color: T.danger },
          { label: 'Super Admins', value: kpis.porPerfil['super_admin'] || 0, color: '#C4556A' },
        ].map((k, i) => (
          <div key={i} style={{ padding: '14px 18px', borderRight: i < 3 ? `1px solid ${T.border}` : 'none' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '.07em', textTransform: 'uppercase', color: T.textTer, marginBottom: '6px' }}>{k.label}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: k.color, letterSpacing: '-.02em' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: T.bg2, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '7px 12px' }}>
            <input
              style={{ background: 'none', border: 'none', color: T.text, fontFamily: 'Inter, sans-serif', fontSize: '12px', outline: 'none', width: '180px' }}
              placeholder="Buscar nome ou email..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ ...sel }}>
            <option value="todos">Todos os status</option>
            <option value="ativos">Apenas ativos</option>
            <option value="inativos">Apenas inativos</option>
          </select>
          <select value={filtroPerfil} onChange={e => setFiltroPerfil(e.target.value)} style={{ ...sel }}>
            <option value="">Todos os perfis</option>
            {PERFIS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
          </select>
        </div>
        {isSuperAdmin && (
          <Btn variant="brand" onClick={() => { setShowForm(true); setEditing(null); setForm(DEFAULT_FORM); }}>
            <UserPlus size={13} /> Adicionar
          </Btn>
        )}
      </div>

      {copied && (
        <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '7px', padding: '10px 14px', fontSize: '13px', color: T.success }}>
          ✓ Link copiado! Compartilhe com o membro.
        </div>
      )}

      {/* Lista de membros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: T.textTer, fontSize: '14px' }}>Nenhum membro encontrado.</div>
        ) : filtrados.map(m => (
          <MembroCard
            key={m.id}
            membro={m}
            user={user}
            isSuperAdmin={isSuperAdmin}
            onEdit={handleEdit}
            onDelete={(m) => { if (window.confirm(`Remover ${m.nome}?`)) deleteMutation.mutate(m); }}
            onToggle={(m) => toggleMutation.mutate(m)}
            onCopyLink={handleCopyLink}
            onImpersonate={(m) => setImpersonating(m)}
            onSendInvite={handleSendInvite}
          />
        ))}
      </div>

      {/* Referência de perfis */}
      <div style={{ background: T.bg2, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '16px 20px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '.06em', textTransform: 'uppercase', color: T.textTer, marginBottom: '12px' }}>Referência de perfis RBAC</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {PERFIS.filter(p => !['coordenador','coordenadora_geral','gestora_inscricoes'].includes(p.value)).map(p => (
            <div key={p.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px', background: p.color + '20', color: p.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {p.icon} {p.label}
              </span>
              <span style={{ fontSize: '12px', color: T.textTer }}>{p.desc}</span>
            </div>
          ))}
        </div>
      </div>
      </>
      )}

      {subTab === 'solicitacoes' && (
        <M31SolicitacoesAcesso user={user} />
      )}

      {/* Modals */}
      {showForm && (
        <MembroForm
          form={form}
          setForm={setForm}
          editing={editing}
          onSave={() => saveMutation.mutate(form)}
          onClose={() => { setShowForm(false); setEditing(null); setForm(DEFAULT_FORM); }}
          isPending={saveMutation.isPending}
        />
      )}
      {impersonating && (
        <ImpersonateModal
          membro={impersonating}
          onConfirm={() => handleImpersonate(impersonating)}
          onClose={() => setImpersonating(null)}
        />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
