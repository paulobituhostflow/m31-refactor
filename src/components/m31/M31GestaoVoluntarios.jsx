import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, X, ChevronDown, ChevronUp, Sparkles, Loader,
  Mic2, UtensilsCrossed, Star, ShoppingBag, BookOpen,
  ScanLine, Clapperboard, Camera, Truck, Heart, User, Tags
} from 'lucide-react';
import M31GruposDisparos from '@/components/m31/voluntarios/M31GruposDisparos';
import GroupAssignmentModal from '@/components/m31/voluntarios/GroupAssignmentModal';
import M31FinanceiroVoluntarios from '@/components/m31/voluntarios/M31FinanceiroVoluntarios';
import M31CamisasPagamento from '@/components/m31/voluntarios/M31CamisasPagamento';

// ── DESIGN TOKENS ─────────────────────────────────────────────
const T = {
  pageBg: '#F5F6FA',
  surface1: '#FFFFFF',
  surface2: '#FFFFFF',
  surface3: '#F9FAFB',
  border: '#E5E7EB',
  borderMd: '#D1D5DB',
  text: '#1A1A1A',
  textSec: '#6B7280',
  textMut: '#9CA3AF',
  accent: '#7A1F2B',
  accentBright: '#9A2838',
  green: '#10B981',
  amber: '#F59E0B',
  red: '#EF4444',
  blue: '#3B82F6',
  fontHead: "'Inter', sans-serif",
  fontBody: "'Inter', sans-serif",
};

// ── SETORES ────────────────────────────────────────────────────
const SETORES = [
  { id: 'intercessao',    label: 'Intercessão',          lider: 'Pr. Eduardo',    icon: Heart },
  { id: 'louvor',         label: 'Louvor',                lider: 'Dário',          icon: Mic2 },
  { id: 'alimentacao',    label: 'Alimentação',           lider: 'A definir',      icon: UtensilsCrossed },
  { id: 'espaco_filhas',  label: 'Espaço Filhas',         lider: 'A definir',      icon: Star },
  { id: 'lojinha',        label: 'Lojinha',               lider: 'A definir',      icon: ShoppingBag },
  { id: 'sala_pastoral',  label: 'Sala Pastoral',         lider: 'Helenilda',      icon: BookOpen },
  { id: 'checkin',        label: 'Check-in / Inscrições', lider: 'Thaisa Videres', icon: ScanLine },
  { id: 'gerencia_culto', label: 'Gerência de Culto',     lider: 'Luana / Duda',   icon: Clapperboard },
  { id: 'midia',          label: 'Mídia',                 lider: 'Paulinho',       icon: Camera },
  { id: 'logistica',      label: 'Logística',             lider: 'Felipe / Jaime', icon: Truck },
];

const STATUS_CFG = {
  ativo:    { label: 'Ativo',     color: T.green },
  pendente: { label: 'Pendente',  color: T.amber },
  inativo:  { label: 'Inativo',   color: T.red },
};

const PRESENCA_CFG = {
  presente:   { label: 'Presente',   color: T.green,  symbol: '✓' },
  ausente:    { label: 'Ausente',    color: T.red,    symbol: '✗' },
  justificado:{ label: 'Justificado',color: T.amber,  symbol: '!' },
};

// ── PRIMITIVOS ─────────────────────────────────────────────────
function Chip({ label, color }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: '11px', fontWeight: '600', letterSpacing: '0.03em',
      color, backgroundColor: `${color}18`,
      border: `1px solid ${color}28`,
      borderRadius: '5px', padding: '2px 8px',
      fontFamily: T.fontBody,
    }}>{label}</span>
  );
}

function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, style = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    borderRadius: '8px', fontFamily: T.fontBody, fontWeight: '600', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s', border: 'none', opacity: disabled ? 0.5 : 1,
    fontSize: size === 'sm' ? '12px' : '13px',
    padding: size === 'sm' ? '6px 12px' : '9px 18px',
  };
  const variants = {
    primary:  { backgroundColor: T.accent, color: '#fff' },
    ghost:    { backgroundColor: '#F8F8F9', color: T.textSec, border: `1px solid ${T.border}` },
    success:  { backgroundColor: T.green, color: '#FFFFFF' },
    subtle:   { backgroundColor: `${T.accentBright}12`, color: T.accentBright, border: `1px solid ${T.accentBright}22` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

// ── FORMULÁRIO VOLUNTÁRIO ──────────────────────────────────────
function VoluntarioForm({ onSave, onClose, grupos = [] }) {
  const [form, setForm] = useState({ nome: '', whatsapp: '', email: '', setor: SETORES[0].id, funcao: '', status: 'pendente', observacoes: '', grupo_ids: [] });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleGrupo = (gid) => setForm(f => {
    const arr = f.grupo_ids || [];
    return { ...f, grupo_ids: arr.includes(gid) ? arr.filter(x => x !== gid) : [...arr, gid] };
  });
  const inp = {
    width: '100%', backgroundColor: T.surface1, border: `1px solid ${T.border}`,
    borderRadius: '8px', color: T.text, fontFamily: T.fontBody, fontSize: '13px',
    padding: '10px 12px', outline: 'none', boxSizing: 'border-box',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <input style={inp} placeholder="Nome completo *" value={form.nome} onChange={e => set('nome', e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <input style={inp} placeholder="WhatsApp" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} />
        <input style={inp} placeholder="Email" value={form.email} onChange={e => set('email', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <select style={{ ...inp, cursor: 'pointer' }} value={form.setor} onChange={e => set('setor', e.target.value)}>
          {SETORES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input style={inp} placeholder="Função" value={form.funcao} onChange={e => set('funcao', e.target.value)} />
      </div>
      <select style={{ ...inp, cursor: 'pointer' }} value={form.status} onChange={e => set('status', e.target.value)}>
        <option value="pendente">Pendente</option>
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </select>
      {grupos.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Grupos</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {grupos.map(g => {
              const sel = (form.grupo_ids || []).includes(g.id);
              return (
                <button key={g.id} type="button" onClick={() => toggleGrupo(g.id)} style={{
                  fontSize: '11px', fontWeight: '600', padding: '4px 10px', borderRadius: '5px',
                  cursor: 'pointer', fontFamily: T.fontBody, border: `1px solid ${sel ? T.accentBright : T.border}`,
                  backgroundColor: sel ? `${T.accentBright}12` : T.surface1, color: sel ? T.accentBright : T.textMut,
                }}>{g.codigo} · {g.nome}</button>
              );
            })}
          </div>
        </div>
      )}
      <textarea style={{ ...inp, resize: 'vertical', minHeight: '56px' }} placeholder="Observações" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => form.nome && onSave(form)}>Salvar Voluntário</Btn>
      </div>
    </div>
  );
}

// ── FORMULÁRIO REUNIÃO ─────────────────────────────────────────
function ReuniaoForm({ onSave, onClose }) {
  const [form, setForm] = useState({ titulo: '', data: '', horario: '', tipo: 'intercessao', setor: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = { width: '100%', backgroundColor: T.surface1, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, fontFamily: T.fontBody, fontSize: '13px', padding: '10px 12px', outline: 'none', boxSizing: 'border-box' };
  const valido = form.titulo && form.data && (form.tipo !== 'setor' || form.setor);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <input style={inp} placeholder="Título da reunião *" value={form.titulo} onChange={e => set('titulo', e.target.value)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <input style={inp} type="date" value={form.data} onChange={e => set('data', e.target.value)} />
        <input style={inp} placeholder="Horário (ex: 19:00)" value={form.horario} onChange={e => set('horario', e.target.value)} />
      </div>
      <select style={{ ...inp, cursor: 'pointer' }} value={form.tipo} onChange={e => set('tipo', e.target.value)}>
        <option value="intercessao">Intercessão</option>
        <option value="geral">Geral</option>
        <option value="setor">Por Setor</option>
      </select>
      {form.tipo === 'setor' && (
        <select style={{ ...inp, cursor: 'pointer' }} value={form.setor} onChange={e => set('setor', e.target.value)}>
          <option value="">Selecione o setor *</option>
          {SETORES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" disabled={!valido} onClick={() => valido && onSave(form)}>Agendar Reunião</Btn>
      </div>
    </div>
  );
}

// ── KPI CARD ───────────────────────────────────────────────────
function KpiCard({ label, value, color, sub }) {
  return (
    <div style={{
      backgroundColor: T.surface2,
      border: `1px solid ${T.border}`,
      borderRadius: '12px',
      padding: '18px 20px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.fontBody, marginBottom: '12px' }}>{label}</div>
      <div style={{ fontSize: '30px', fontWeight: '800', color: color || T.text, fontFamily: T.fontHead, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: T.textMut, marginTop: '6px', fontFamily: T.fontBody }}>{sub}</div>}
    </div>
  );
}

// ── PAINEL REUNIÕES ────────────────────────────────────────────
function PainelReunioes({ reunioes, voluntarios, presencas, onNovaReuniao, onCriarReuniao, onTogglePresenca, onPresencaIA, showForm, setShowForm }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: T.textSec, fontFamily: T.fontBody }}>
          {reunioes.length === 1 ? '1 reunião cadastrada' : `${reunioes.length} reuniões cadastradas`}
        </div>
        <Btn variant="primary" size="sm" onClick={onNovaReuniao}>
          <Plus size={13} /> Nova Reunião
        </Btn>
      </div>

      {showForm && (
        <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.borderMd}`, borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: T.text, fontFamily: T.fontHead, marginBottom: '16px' }}>Nova Reunião</div>
          <ReuniaoForm onSave={d => onCriarReuniao(d)} onClose={() => setShowForm(false)} />
        </div>
      )}

      {reunioes.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '48px 24px', backgroundColor: T.surface1, border: `1px solid ${T.border}`, borderRadius: '12px' }}>
          <div style={{ fontSize: '13px', color: T.textMut, fontFamily: T.fontBody }}>Nenhuma reunião cadastrada</div>
        </div>
      )}

      {reunioes.map(r => {
        const isOpen = expanded === r.id;
        const presencasR = presencas.filter(p => p.reuniao_id === r.id);
        const presentes = presencasR.filter(p => p.status === 'presente').length;
        const volsDoTipo = r.tipo === 'intercessao'
          ? voluntarios.filter(v => v.setor === 'intercessao')
          : r.tipo === 'setor' && r.setor
            ? voluntarios.filter(v => v.setor === r.setor)
            : voluntarios;
        const pctPresenca = volsDoTipo.length > 0 ? Math.round(presentes / volsDoTipo.length * 100) : 0;

        return (
          <div key={r.id} style={{ backgroundColor: T.surface2, border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden' }}>
            <button onClick={() => setExpanded(isOpen ? null : r.id)} style={{ width: '100%', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: T.text }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', fontFamily: T.fontHead, color: T.text }}>{r.titulo}</div>
                <div style={{ fontSize: '12px', color: T.textSec, marginTop: '3px', fontFamily: T.fontBody }}>
                  {r.data ? new Date(r.data + 'T00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : ''} {r.horario || ''}
                  <span style={{ color: T.green, marginLeft: '12px', fontWeight: '600' }}>{presentes} presentes</span>
                  <span style={{ color: T.textMut }}> / {volsDoTipo.length} ({pctPresenca}%)</span>
                </div>
                {/* Barra de acompanhamento de presença */}
                <div style={{ width: '180px', height: '4px', backgroundColor: T.border, borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                  <div style={{ width: `${pctPresenca}%`, height: '100%', backgroundColor: pctPresenca >= 70 ? T.green : pctPresenca >= 40 ? T.amber : T.red, borderRadius: '2px', transition: 'width 0.3s' }} />
                </div>
              </div>
              {isOpen ? <ChevronUp size={15} color={T.textMut} /> : <ChevronDown size={15} color={T.textMut} />}
            </button>

            {isOpen && (
              <div style={{ padding: '0 20px 20px', borderTop: `1px solid ${T.border}` }}>
                <div style={{ paddingTop: '16px', marginBottom: '12px' }}>
                  <Btn variant="subtle" size="sm" onClick={() => onPresencaIA(r)}>
                    <Sparkles size={13} /> Processar lista com IA
                  </Btn>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {volsDoTipo.map(v => {
                    const p = presencasR.find(p => p.voluntario_id === v.id);
                    return (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: T.surface1, borderRadius: '8px' }}>
                        <div>
                          <div style={{ fontSize: '13px', color: T.text, fontWeight: '500' }}>{v.nome}</div>
                          <div style={{ fontSize: '11px', color: T.textMut, marginTop: '1px' }}>{v.funcao || SETORES.find(s => s.id === v.setor)?.label || ''}</div>
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {['presente', 'ausente', 'justificado'].map(s => {
                            const cfg = PRESENCA_CFG[s];
                            const active = p?.status === s;
                            return (
                              <button key={s} onClick={() => onTogglePresenca(v, r, s)} title={cfg.label} style={{
                                width: '30px', height: '30px', borderRadius: '7px', border: `1px solid ${active ? cfg.color : T.border}`,
                                backgroundColor: active ? `${cfg.color}20` : 'transparent',
                                color: active ? cfg.color : T.textMut,
                                cursor: 'pointer', fontSize: '13px', fontWeight: '700', transition: 'all 0.12s',
                              }}>{cfg.symbol}</button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── DETALHE VOLUNTÁRIO ─────────────────────────────────────────
function VoluntarioDetalhe({ vol, presencas, reunioes, onCheckin, onClose }) {
  const setor = SETORES.find(s => s.id === vol.setor);
  const SIcon = setor?.icon || User;
  const minhasPresencas = presencas.filter(p => p.voluntario_id === vol.id);
  const presentes = minhasPresencas.filter(p => p.status === 'presente').length;
  const pct = reunioes.length > 0 ? Math.round(presentes / reunioes.length * 100) : null;
  const pctColor = pct == null ? T.textMut : pct >= 70 ? T.green : pct >= 40 ? T.amber : T.red;

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.borderMd}`, borderTop: `1px solid ${T.borderMd}`, borderRadius: '14px 14px 0 0', width: '100%', maxWidth: '480px', padding: '24px', maxHeight: '88vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '10px', backgroundColor: `${T.accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <SIcon size={20} color={T.accentBright} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, fontFamily: T.fontHead }}>{vol.nome}</div>
              <div style={{ fontSize: '12px', color: T.textSec, marginTop: '2px', fontFamily: T.fontBody }}>{setor?.label} · {vol.funcao || 'Sem função definida'}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMut, cursor: 'pointer', padding: '4px' }}><X size={17} /></button>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Status', val: STATUS_CFG[vol.status]?.label || '—', color: STATUS_CFG[vol.status]?.color },
            { label: 'Evento', val: vol.checkin_evento ? 'Presente' : 'Pendente', color: vol.checkin_evento ? T.green : T.amber },
            { label: 'Presenças', val: pct != null ? `${pct}%` : '—', color: pctColor },
          ].map(k => (
            <div key={k.label} style={{ backgroundColor: T.surface1, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', fontWeight: '600', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{k.label}</div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: k.color, fontFamily: T.fontHead }}>{k.val}</div>
            </div>
          ))}
        </div>

        {/* Check-in */}
        {!vol.checkin_evento ? (
          <button onClick={() => onCheckin(vol.id)} style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: T.green, color: '#FFFFFF', fontFamily: T.fontHead, fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginBottom: '20px' }}>
            Confirmar presença no evento
          </button>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px', backgroundColor: `${T.green}12`, border: `1px solid ${T.green}25`, borderRadius: '10px', color: T.green, fontSize: '13px', fontWeight: '600', marginBottom: '20px', fontFamily: T.fontBody }}>
            Check-in realizado {vol.checkin_evento_at ? '· ' + new Date(vol.checkin_evento_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
          </div>
        )}

        {/* Histórico */}
        {reunioes.length > 0 && (
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Histórico de presenças</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {reunioes.map(r => {
                const p = minhasPresencas.find(p => p.reuniao_id === r.id);
                const cfg = p ? PRESENCA_CFG[p.status] : null;
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: T.surface1, borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', color: T.text }}>{r.titulo}</div>
                      <div style={{ fontSize: '11px', color: T.textMut }}>{r.data ? new Date(r.data + 'T00:00').toLocaleDateString('pt-BR') : ''}</div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: cfg ? cfg.color : T.textMut }}>
                      {cfg ? cfg.label : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {vol.observacoes && (
          <div style={{ marginTop: '16px', padding: '12px 14px', backgroundColor: T.surface1, borderRadius: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>Observações</div>
            <div style={{ fontSize: '13px', color: T.textSec }}>{vol.observacoes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MODAL PRESENÇA IA ──────────────────────────────────────────
function ModalPresencaIA({ reuniao, voluntarios, onSave, onClose }) {
  const [lista, setLista] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function processar() {
    setLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `Lista de presença de uma reunião:
"${lista}"

Voluntários cadastrados:
${voluntarios.map((v, i) => `${i + 1}. ${v.nome}`).join('\n')}

Para cada voluntário, determine se está presente na lista (considere apelidos, abreviações). Retorne array com status para CADA voluntário.`,
        response_json_schema: {
          type: 'object',
          properties: {
            presencas: { type: 'array', items: { type: 'object', properties: { nome: { type: 'string' }, status: { type: 'string', enum: ['presente', 'ausente'] } } } }
          }
        }
      });
      setResultado(res.presencas || []);
    } catch (e) {
      alert('Erro: ' + e.message);
    }
    setLoading(false);
  }

  function confirmar() {
    if (!resultado) return;
    const arr = resultado.map(r => {
      const vol = voluntarios.find(v => v.nome.toLowerCase() === r.nome.toLowerCase())
        || voluntarios.find(v => r.nome.toLowerCase().includes(v.nome.split(' ')[0].toLowerCase()));
      if (!vol) return null;
      return { voluntario_id: vol.id, voluntario_nome: vol.nome, reuniao_id: reuniao.id, reuniao_titulo: reuniao.titulo, reuniao_data: reuniao.data, status: r.status };
    }).filter(Boolean);
    onSave(arr);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.borderMd}`, borderRadius: '14px', width: '100%', maxWidth: '500px', padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={17} color={T.accentBright} />
            <span style={{ fontSize: '15px', fontWeight: '700', color: T.text, fontFamily: T.fontHead }}>Lista de presença com IA</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMut, cursor: 'pointer' }}><X size={17} /></button>
        </div>
        <p style={{ fontSize: '13px', color: T.textSec, marginBottom: '14px', fontFamily: T.fontBody, lineHeight: '1.5' }}>Cole qualquer formato de lista (nomes, WhatsApp, foto de papel). A IA identifica quem estava presente.</p>
        <textarea
          style={{ width: '100%', minHeight: '110px', backgroundColor: T.surface1, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, fontSize: '13px', fontFamily: T.fontBody, padding: '10px 12px', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
          placeholder="Cole a lista de presença aqui..."
          value={lista}
          onChange={e => setLista(e.target.value)}
        />
        {!resultado && (
          <Btn variant="primary" onClick={processar} disabled={!lista.trim() || loading} style={{ width: '100%', marginTop: '12px', justifyContent: 'center', padding: '12px' }}>
            {loading ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Processando...</> : <><Sparkles size={15} /> Processar com IA</>}
          </Btn>
        )}
        {resultado && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: T.textMut, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
              Resultado — {resultado.filter(r => r.status === 'presente').length} presentes de {resultado.length}
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '14px' }}>
              {resultado.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', backgroundColor: T.surface1, borderRadius: '6px' }}>
                  <span style={{ fontSize: '13px', color: T.text }}>{r.nome}</span>
                  <Chip label={r.status === 'presente' ? 'Presente' : 'Ausente'} color={r.status === 'presente' ? T.green : T.red} />
                </div>
              ))}
            </div>
            <Btn variant="success" onClick={confirmar} style={{ width: '100%', justifyContent: 'center', padding: '12px' }}>
              Confirmar e salvar presenças
            </Btn>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ───────────────────────────────────────
export default function M31GestaoVoluntarios({ initialSetor }) {
  const [subTab, setSubTab] = useState('voluntarios');
  const [showForm, setShowForm] = useState(false);
  const [showReuniaoForm, setShowReuniaoForm] = useState(false);
  const [filtroSetor, setFiltroSetor] = useState(initialSetor || 'todos');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [volSelecionado, setVolSelecionado] = useState(null);
  const [reuniaoIA, setReuniaoIA] = useState(null);
  const [volGerenciarGrupos, setVolGerenciarGrupos] = useState(null);
  const qc = useQueryClient();

  const { data: voluntarios = [] } = useQuery({ queryKey: ['m31voluntarios'], queryFn: () => base44.entities.EventoM31Voluntario.list('-created_date', 500) });
  const { data: reunioes = [] } = useQuery({ queryKey: ['m31reunioes'], queryFn: () => base44.entities.EventoM31Reuniao.list('-data', 100) });
  const { data: presencas = [] } = useQuery({ queryKey: ['m31presencas'], queryFn: () => base44.entities.EventoM31Presenca.list('-created_date', 2000) });
  const { data: grupos = [] } = useQuery({ queryKey: ['m31voluntarioGrupos'], queryFn: () => base44.entities.M31VoluntarioGrupo.list('-created_date', 200) });

  const criarVol = useMutation({ mutationFn: d => base44.entities.EventoM31Voluntario.create(d), onSuccess: () => { qc.invalidateQueries(['m31voluntarios']); setShowForm(false); } });
  const criarReuniao = useMutation({ mutationFn: d => base44.entities.EventoM31Reuniao.create(d), onSuccess: () => { qc.invalidateQueries(['m31reunioes']); setShowReuniaoForm(false); } });
  const checkinMut = useMutation({
    mutationFn: id => base44.entities.EventoM31Voluntario.update(id, { checkin_evento: true, checkin_evento_at: new Date().toISOString() }),
    onSuccess: () => { qc.invalidateQueries(['m31voluntarios']); setVolSelecionado(null); }
  });

  async function togglePresenca(vol, reuniao, status) {
    const existente = presencas.find(p => p.voluntario_id === vol.id && p.reuniao_id === reuniao.id);
    if (existente) await base44.entities.EventoM31Presenca.update(existente.id, { status });
    else await base44.entities.EventoM31Presenca.create({ voluntario_id: vol.id, voluntario_nome: vol.nome, reuniao_id: reuniao.id, reuniao_titulo: reuniao.titulo, reuniao_data: reuniao.data, status });
    qc.invalidateQueries(['m31presencas']);
  }

  async function salvarPresencasIA(lista) {
    for (const p of lista) {
      const existente = presencas.find(px => px.voluntario_id === p.voluntario_id && px.reuniao_id === p.reuniao_id);
      if (existente) await base44.entities.EventoM31Presenca.update(existente.id, { status: p.status });
      else await base44.entities.EventoM31Presenca.create(p);
    }
    qc.invalidateQueries(['m31presencas']);
    setReuniaoIA(null);
  }

  // Stats
  const total = voluntarios.length;
  const ativos = voluntarios.filter(v => v.status === 'ativo').length;
  const pendentes = voluntarios.filter(v => v.status === 'pendente').length;
  const comCheckin = voluntarios.filter(v => v.checkin_evento).length;
  const totalP = presencas.filter(p => p.status === 'presente').length;
  const totalReg = presencas.length;
  const pctPres = totalReg > 0 ? Math.round(totalP / totalReg * 100) : 0;
  const pctPresColor = pctPres >= 70 ? T.green : pctPres >= 40 ? T.amber : T.red;

  // Filtros
  const volsFiltrados = useMemo(() => voluntarios.filter(v => {
    if (filtroSetor !== 'todos' && v.setor !== filtroSetor) return false;
    if (filtroStatus !== 'todos' && v.status !== filtroStatus) return false;
    if (filtroGrupo !== 'todos' && !(v.grupo_ids || []).includes(filtroGrupo)) return false;
    return true;
  }), [voluntarios, filtroSetor, filtroStatus, filtroGrupo]);

  const porSetor = useMemo(() => {
    const map = {};
    SETORES.forEach(s => { map[s.id] = []; });
    volsFiltrados.forEach(v => { if (map[v.setor]) map[v.setor].push(v); });
    return map;
  }, [volsFiltrados]);

  // Estilo sub-tab
  const tabBtn = (id, label) => (
    <button onClick={() => setSubTab(id)} style={{
      padding: '7px 20px', borderRadius: '7px', border: 'none',
      backgroundColor: subTab === id ? T.accent : 'transparent',
      color: subTab === id ? '#fff' : T.textSec,
      fontSize: '13px', fontWeight: subTab === id ? '600' : '400',
      cursor: 'pointer', fontFamily: T.fontBody, transition: 'all 0.12s',
    }}>{label}</button>
  );

  const selStyle = {
    backgroundColor: T.surface2, border: `1px solid ${T.border}`,
    borderRadius: '8px', color: T.textSec, fontFamily: T.fontBody,
    fontSize: '12px', padding: '7px 12px', outline: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: '2px', backgroundColor: T.surface1, borderRadius: '9px', padding: '3px', width: 'fit-content', border: `1px solid ${T.border}` }}>
        {tabBtn('voluntarios', 'Voluntários')}
        {tabBtn('camisas', 'Camisas & Pagamento')}
        {tabBtn('financeiro', 'Financeiro')}
        {tabBtn('grupos', 'Grupos & Disparos')}
        {tabBtn('reunioes', 'Reuniões')}
      </div>

      {/* KPIs (ocultos na aba financeiro, que tem os seus próprios) */}
      {subTab !== 'financeiro' && subTab !== 'camisas' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
        <KpiCard label="Total" value={total} />
        <KpiCard label="Ativos" value={ativos} color={T.green} sub={`${total > 0 ? Math.round(ativos/total*100) : 0}% do total`} />
        <KpiCard label="Pendentes" value={pendentes} color={T.amber} />
        <KpiCard label="Check-in" value={comCheckin} color={T.blue} sub={`${total > 0 ? Math.round(comCheckin/total*100) : 0}% confirmados`} />
        <KpiCard label="Presença" value={totalReg > 0 ? `${pctPres}%` : '—'} color={pctPresColor} sub="média nas reuniões" />
      </div>
      )}

      {/* ── ABA CAMISAS & PAGAMENTO ─── */}
      {subTab === 'camisas' && <M31CamisasPagamento />}

      {/* ── ABA FINANCEIRO ─── */}
      {subTab === 'financeiro' && <M31FinanceiroVoluntarios />}

      {/* ── ABA VOLUNTÁRIOS ─── */}
      {subTab === 'voluntarios' && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
            <select style={selStyle} value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
              <option value="todos">Todos os setores</option>
              {SETORES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select style={selStyle} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
              <option value="todos">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="pendente">Pendente</option>
              <option value="inativo">Inativo</option>
            </select>
            {grupos.length > 0 && (
              <select style={selStyle} value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}>
                <option value="todos">Todos os grupos</option>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.codigo} · {g.nome}</option>)}
              </select>
            )}
            <div style={{ marginLeft: 'auto' }}>
              <Btn variant="primary" onClick={() => setShowForm(v => !v)}>
                <Plus size={14} /> Novo Voluntário
              </Btn>
            </div>
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.borderMd}`, borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', fontWeight: '600', color: T.text, fontFamily: T.fontHead, marginBottom: '16px' }}>Novo Voluntário</div>
              <VoluntarioForm grupos={grupos} onSave={d => criarVol.mutate(d)} onClose={() => setShowForm(false)} />
            </div>
          )}

          {/* Setores */}
          {SETORES.map(s => {
            const vols = porSetor[s.id] || [];
            if (filtroSetor !== 'todos' && filtroSetor !== s.id) return null;
            const SIcon = s.icon;

            return (
              <div key={s.id} style={{ marginBottom: '28px' }}>
                {/* Cabeçalho do setor */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  paddingBottom: '12px',
                  borderBottom: `1px solid ${T.border}`,
                  marginBottom: '14px',
                }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: `${T.accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SIcon size={15} color={T.accentBright} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: T.text, fontFamily: T.fontHead }}>{s.label}</div>
                    <div style={{ fontSize: '11px', color: T.textMut, marginTop: '1px' }}>Líder: {s.lider}</div>
                  </div>
                  <span style={{ fontSize: '12px', color: T.textMut, fontFamily: T.fontBody }}>
                    {vols.length} voluntário{vols.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {vols.length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', color: T.textMut, fontFamily: T.fontBody }}>Nenhum voluntário neste setor</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '8px' }}>
                    {vols.map(v => {
                      const presV = presencas.filter(p => p.voluntario_id === v.id);
                      const pPct = presV.length > 0 ? Math.round(presV.filter(p => p.status === 'presente').length / presV.length * 100) : null;
                      const sCfg = STATUS_CFG[v.status] || {};
                      return (
                        <div key={v.id}
                          style={{
                            textAlign: 'left', padding: '14px 16px',
                            backgroundColor: T.surface1, border: `1px solid ${T.border}`,
                            borderRadius: '9px', cursor: 'pointer', transition: 'all 0.13s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.surface3; e.currentTarget.style.borderColor = T.borderMd; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.surface1; e.currentTarget.style.borderColor = T.border; }}
                          onClick={() => setVolSelecionado(v)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, fontFamily: T.fontHead, lineHeight: '1.3', paddingRight: '8px' }}>{v.nome}</div>
                            <Chip label={sCfg.label || v.status} color={sCfg.color || T.textMut} />
                          </div>
                          <div style={{ fontSize: '12px', color: T.textSec, marginBottom: '8px' }}>{v.funcao || '—'}</div>
                          {(v.grupo_ids || []).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                              {(v.grupo_ids || []).map(gid => {
                                const g = grupos.find(x => x.id === gid);
                                if (!g) return null;
                                return <span key={gid} style={{ fontSize: '10px', fontWeight: '600', color: T.blue, backgroundColor: `${T.blue}12`, border: `1px solid ${T.blue}22`, borderRadius: '4px', padding: '1px 6px' }}>{g.codigo}</span>;
                              })}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: v.checkin_evento ? T.green : T.textMut }}>
                              {v.checkin_evento ? '● Check-in' : '○ Sem check-in'}
                            </span>
                            {pPct != null && (
                              <span style={{ fontSize: '11px', color: pPct >= 70 ? T.green : pPct >= 40 ? T.amber : T.red }}>
                                {pPct}% presenças
                              </span>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); setVolGerenciarGrupos(v); }} title="Gerenciar grupos" style={{
                              marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '3px',
                              background: 'none', border: `1px solid ${T.border}`, borderRadius: '5px',
                              padding: '2px 7px', cursor: 'pointer', fontSize: '10px', fontWeight: '600',
                              color: T.textSec, fontFamily: T.fontBody,
                            }}><Tags size={11} /> Grupos</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ABA GRUPOS & DISPAROS ─── */}
      {subTab === 'grupos' && (
        <M31GruposDisparos voluntarios={voluntarios} />
      )}

      {/* ── ABA REUNIÕES ─── */}
      {subTab === 'reunioes' && (
        <PainelReunioes
          reunioes={reunioes}
          voluntarios={voluntarios}
          presencas={presencas}
          onNovaReuniao={() => setShowReuniaoForm(true)}
          onCriarReuniao={d => criarReuniao.mutate(d)}
          onTogglePresenca={togglePresenca}
          onPresencaIA={r => setReuniaoIA(r)}
          showForm={showReuniaoForm}
          setShowForm={setShowReuniaoForm}
        />
      )}

      {/* Detalhe */}
      {volSelecionado && (
        <VoluntarioDetalhe
          vol={volSelecionado}
          presencas={presencas}
          reunioes={reunioes}
          onCheckin={id => checkinMut.mutate(id)}
          onClose={() => setVolSelecionado(null)}
        />
      )}

      {/* IA Modal */}
      {reuniaoIA && (
        <ModalPresencaIA
          reuniao={reuniaoIA}
          voluntarios={reuniaoIA.tipo === 'intercessao' ? voluntarios.filter(v => v.setor === 'intercessao') : reuniaoIA.tipo === 'setor' && reuniaoIA.setor ? voluntarios.filter(v => v.setor === reuniaoIA.setor) : voluntarios}
          onSave={salvarPresencasIA}
          onClose={() => setReuniaoIA(null)}
        />
      )}

      {/* Gerenciar Grupos */}
      {volGerenciarGrupos && (
        <GroupAssignmentModal
          vol={volGerenciarGrupos}
          grupos={grupos}
          onSaved={() => qc.invalidateQueries(['m31voluntarios'])}
          onClose={() => setVolGerenciarGrupos(null)}
        />
      )}
    </div>
  );
}