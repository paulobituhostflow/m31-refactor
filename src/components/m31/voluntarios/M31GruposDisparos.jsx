import { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Send, Users, Trash2, Clock, CheckSquare, Square,
  AlertCircle, Loader, MessageSquare
} from 'lucide-react';

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

const REGRA_CFG = {
  individual: { label: 'Individual', color: T.blue },
  grupo: { label: 'Grupo (Massa)', color: T.accentBright },
  lembrete_automatico: { label: 'Lembrete Automático', color: T.amber },
};

function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, style = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
    borderRadius: '8px', fontFamily: T.fontBody, fontWeight: '600', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s', border: 'none', opacity: disabled ? 0.5 : 1,
    fontSize: size === 'sm' ? '12px' : '13px',
    padding: size === 'sm' ? '6px 12px' : '9px 18px',
  };
  const variants = {
    primary: { backgroundColor: T.accent, color: '#fff' },
    ghost: { backgroundColor: '#F8F8F9', color: T.textSec, border: `1px solid ${T.border}` },
    success: { backgroundColor: T.green, color: '#FFFFFF' },
    subtle: { backgroundColor: `${T.accentBright}12`, color: T.accentBright, border: `1px solid ${T.accentBright}22` },
    danger: { backgroundColor: `${T.red}12`, color: T.red, border: `1px solid ${T.red}22` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

// ── FORMULÁRIO DE GRUPO ──────────────────────────────────────────
function GrupoForm({ onSave, onClose }) {
  const [form, setForm] = useState({ nome: '', codigo: '', regra_disparo: 'grupo', ativo: true, observacoes: '' });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const inp = {
    width: '100%', backgroundColor: T.surface1, border: `1px solid ${T.border}`,
    borderRadius: '8px', color: T.text, fontFamily: T.fontBody, fontSize: '13px',
    padding: '10px 12px', outline: 'none', boxSizing: 'border-box',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '10px' }}>
        <input style={inp} placeholder="Nome do grupo *" value={form.nome} onChange={e => set('nome', e.target.value)} />
        <input style={inp} placeholder="Código (G01)" value={form.codigo} onChange={e => set('codigo', e.target.value.toUpperCase())} />
      </div>
      <select style={{ ...inp, cursor: 'pointer' }} value={form.regra_disparo} onChange={e => set('regra_disparo', e.target.value)}>
        <option value="individual">Individual (1 voluntário)</option>
        <option value="grupo">Grupo (Massa)</option>
        <option value="lembrete_automatico">Lembrete Automático</option>
      </select>
      <textarea style={{ ...inp, resize: 'vertical', minHeight: '48px' }} placeholder="Observações" value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
        <Btn variant="primary" onClick={() => form.nome && form.codigo && onSave(form)}>Salvar Grupo</Btn>
      </div>
    </div>
  );
}

// ── COMPOSER DE MENSAGEM ─────────────────────────────────────────
function MessageComposer({ voluntarios, grupos }) {
  const [mensagem, setMensagem] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [filtroSetor, setFiltroSetor] = useState('todos');
  const [filtroStatus, setFiltroStatus] = useState('ativo');
  const [ignorarReuniao, setIgnorarReuniao] = useState(new Set());
  const [excecoes, setExcecoes] = useState(new Set());
  const [imageUrl, setImageUrl] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const setores = useMemo(() => {
    const s = new Set(voluntarios.map(v => v.setor).filter(Boolean));
    return [...s].sort();
  }, [voluntarios]);

  const filtrados = useMemo(() => voluntarios.filter(v => {
    if (filtroGrupo !== 'todos' && !(v.grupo_ids || []).includes(filtroGrupo)) return false;
    if (filtroSetor !== 'todos' && v.setor !== filtroSetor) return false;
    if (filtroStatus !== 'todos' && v.status !== filtroStatus) return false;
    return true;
  }), [voluntarios, filtroGrupo, filtroSetor, filtroStatus]);

  // lista_de_bloqueio = Ignorar na Reunião + Exceções
  const listaBloqueio = useMemo(() => new Set([...ignorarReuniao, ...excecoes]), [ignorarReuniao, excecoes]);

  // LISTA_DE_ENVIO = filtrados - lista_de_bloqueio - sem telefone - inativos
  const listaEnvio = useMemo(() => filtrados.filter(v => !listaBloqueio.has(v.id) && v.whatsapp && v.status !== 'inativo'), [filtrados, listaBloqueio]);

  function toggleSet(setter, id) {
    setter(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function limparBloqueio() {
    setIgnorarReuniao(new Set());
    setExcecoes(new Set());
  }

  async function enviar() {
    if (!mensagem.trim() || listaEnvio.length === 0) return;
    setEnviando(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('m31DispararVoluntarios', {
        mensagem,
        voluntario_ids: listaEnvio.map(v => v.id),
        excluir_ids: [...listaBloqueio],
        image_url: imageUrl || undefined,
      });
      setResultado(res.data);
      if (res.data?.sucesso !== false) {
        setMensagem('');
        setImageUrl('');
      }
    } catch (e) {
      setResultado({ error: e.message, sucesso: false });
    }
    setEnviando(false);
  }

  const selStyle = {
    backgroundColor: T.surface2, border: `1px solid ${T.border}`,
    borderRadius: '8px', color: T.textSec, fontFamily: T.fontBody,
    fontSize: '12px', padding: '7px 12px', outline: 'none', cursor: 'pointer',
  };
  const inp = {
    width: '100%', backgroundColor: T.surface1, border: `1px solid ${T.border}`,
    borderRadius: '8px', color: T.text, fontFamily: T.fontBody, fontSize: '13px',
    padding: '10px 12px', outline: 'none', boxSizing: 'border-box',
  };

  // Renderiza um painel de seleção múltipla (checkboxes)
  function PainelSelecao({ titulo, subtitulo, icon: Icon, set, setter, color }) {
    const selecionados = filtrados.filter(v => set.has(v.id));
    return (
      <div style={{
        border: `1px solid ${color}30`, borderRadius: '10px', backgroundColor: T.surface1,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${color}20`,
          backgroundColor: `${color}08`, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon size={14} color={color} />
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: T.text, fontFamily: T.fontBody }}>{titulo}</div>
              <div style={{ fontSize: '10px', color: T.textMut }}>{subtitulo}</div>
            </div>
          </div>
          {selecionados.length > 0 && (
            <span style={{ fontSize: '10px', fontWeight: '700', color, backgroundColor: `${color}18`, borderRadius: '4px', padding: '2px 7px' }}>
              {selecionados.length}
            </span>
          )}
        </div>
        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
          {filtrados.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: T.textMut }}>Selecione um grupo primeiro</div>
          ) : filtrados.map(v => {
            const sel = set.has(v.id);
            return (
              <button key={v.id} onClick={() => toggleSet(setter, v.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px',
                borderBottom: `1px solid ${T.border}`, cursor: 'pointer',
                backgroundColor: sel ? `${color}0A` : 'transparent', border: 'none',
                textAlign: 'left',
              }}>
                {sel
                  ? <CheckSquare size={14} color={color} style={{ flexShrink: 0 }} />
                  : <Square size={14} color={T.textMut} style={{ flexShrink: 0 }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: sel ? '600' : '400', color: T.text }}>{v.nome}</div>
                  <div style={{ fontSize: '10px', color: T.textMut }}>{v.setor}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Filtros do grupo */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={selStyle} value={filtroGrupo} onChange={e => { setFiltroGrupo(e.target.value); limparBloqueio(); }}>
          <option value="todos">Todos os grupos</option>
          {grupos.map(g => <option key={g.id} value={g.id}>{g.codigo} · {g.nome}</option>)}
        </select>
        <select style={selStyle} value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
          <option value="todos">Todos os setores</option>
          {setores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select style={selStyle} value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="ativo">Ativos</option>
          <option value="pendente">Pendentes</option>
          <option value="inativo">Inativos</option>
          <option value="todos">Todos status</option>
        </select>
      </div>

      {/* Dois painéis de exclusão lado a lado */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <PainelSelecao
          titulo="Ignorar na Reunião"
          subtitulo="Presentes hoje — não receberão"
          icon={Users}
          set={ignorarReuniao}
          setter={setIgnorarReuniao}
          color={T.amber}
        />
        <PainelSelecao
          titulo="Exceções / Não Enviar"
          subtitulo="Outros motivos de bloqueio"
          icon={AlertCircle}
          set={excecoes}
          setter={setExcecoes}
          color={T.red}
        />
      </div>

      {/* Lista de Envio (preview) */}
      <div style={{ border: `1px solid ${T.green}30`, borderRadius: '10px', backgroundColor: T.surface1, overflow: 'hidden' }}>
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${T.green}20`, backgroundColor: `${T.green}08`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Send size={14} color={T.green} />
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: T.text, fontFamily: T.fontBody }}>Lista de Envio</div>
              <div style={{ fontSize: '10px', color: T.textMut }}>{filtrados.length} no grupo · {listaBloqueio.size} bloqueado(s) · {listaEnvio.length} receberão</div>
            </div>
          </div>
          <span style={{ fontSize: '11px', fontWeight: '700', color: T.green, backgroundColor: `${T.green}18`, borderRadius: '4px', padding: '2px 8px' }}>
            {listaEnvio.length} envios
          </span>
        </div>
        <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
          {listaEnvio.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: T.textMut }}>Nenhum destinatário após filtros</div>
          ) : listaEnvio.map(v => (
            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderBottom: `1px solid ${T.border}` }}>
              <CheckSquare size={13} color={T.green} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '500', color: T.text }}>{v.nome}</div>
                <div style={{ fontSize: '10px', color: T.textMut }}>{v.setor} · {v.whatsapp}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <textarea
        style={{ ...inp, minHeight: '100px', resize: 'vertical' }}
        placeholder="Digite a mensagem... Use {nome} para personalizar"
        value={mensagem}
        onChange={e => setMensagem(e.target.value)}
      />
      <input style={inp} placeholder="URL da imagem (opcional)" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />

      {resultado && (
        <div style={{
          padding: '12px 14px', borderRadius: '8px',
          backgroundColor: resultado.sucesso === false ? `${T.red}10` : `${T.green}10`,
          border: `1px solid ${resultado.sucesso === false ? T.red : T.green}30`,
          fontSize: '12px', color: resultado.sucesso === false ? T.red : T.green, fontFamily: T.fontBody,
        }}>
          {resultado.error ? `Erro: ${resultado.error}` : `✓ ${resultado.enviados} enviadas · ${resultado.falhas} falhas de ${resultado.total_alvos}`}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Btn variant="primary" onClick={enviar} disabled={!mensagem.trim() || enviando || listaEnvio.length === 0}>
          {enviando ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Enviando...</> : <><Send size={14} /> Enviar para {listaEnvio.length} voluntário(s)</>}
        </Btn>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────
export default function M31GruposDisparos({ voluntarios }) {
  const [showForm, setShowForm] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const qc = useQueryClient();

  const { data: grupos = [] } = useQuery({
    queryKey: ['m31voluntarioGrupos'],
    queryFn: () => base44.entities.M31VoluntarioGrupo.list('-created_date', 200),
  });

  const criarGrupo = useMutation({
    mutationFn: d => base44.entities.M31VoluntarioGrupo.create(d),
    onSuccess: () => { qc.invalidateQueries(['m31voluntarioGrupos']); setShowForm(false); },
  });

  const deletarGrupo = useMutation({
    mutationFn: id => base44.entities.M31VoluntarioGrupo.delete(id),
    onSuccess: () => qc.invalidateQueries(['m31voluntarioGrupos']),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Grupos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Users size={16} color={T.accentBright} />
            <span style={{ fontSize: '15px', fontWeight: '700', color: T.text, fontFamily: T.fontHead }}>Grupos de Voluntários</span>
          </div>
          <Btn variant="primary" size="sm" onClick={() => setShowForm(v => !v)}><Plus size={13} /> Novo Grupo</Btn>
        </div>

        {showForm && (
          <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.borderMd}`, borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
            <GrupoForm onSave={d => criarGrupo.mutate(d)} onClose={() => setShowForm(false)} />
          </div>
        )}

        {grupos.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: '10px' }}>
            <Users size={28} color={T.textMut} style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '13px', color: T.textMut, fontFamily: T.fontBody }}>Nenhum grupo criado ainda</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px' }}>
            {grupos.map(g => {
              const regra = REGRA_CFG[g.regra_disparo] || {};
              const count = voluntarios.filter(v => (v.grupo_ids || []).includes(g.id)).length;
              return (
                <div key={g.id} style={{
                  backgroundColor: T.surface1, border: `1px solid ${T.border}`,
                  borderRadius: '10px', padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: T.text, fontFamily: T.fontHead }}>{g.nome}</div>
                      <div style={{ fontSize: '11px', color: T.textMut, fontFamily: T.fontBody, marginTop: '2px' }}>{g.codigo} · {count} voluntário(s)</div>
                    </div>
                    <button onClick={() => deletarGrupo.mutate(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMut, padding: '2px' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <span style={{
                    display: 'inline-flex', fontSize: '10px', fontWeight: '600',
                    color: regra.color, backgroundColor: `${regra.color}18`,
                    border: `1px solid ${regra.color}28`, borderRadius: '5px', padding: '2px 8px',
                  }}>{regra.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Disparo de Mensagens */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={16} color={T.accentBright} />
            <span style={{ fontSize: '15px', fontWeight: '700', color: T.text, fontFamily: T.fontHead }}>Disparo de Mensagens</span>
          </div>
          <Btn variant="subtle" size="sm" onClick={() => setShowComposer(v => !v)}>
            {showComposer ? 'Fechar' : 'Abrir Composer'}
          </Btn>
        </div>

        {showComposer && (
          <div style={{ backgroundColor: T.surface2, border: `1px solid ${T.borderMd}`, borderRadius: '12px', padding: '20px' }}>
            <MessageComposer voluntarios={voluntarios} grupos={grupos} />
          </div>
        )}

        {!showComposer && (
          <div style={{ padding: '24px', textAlign: 'center', border: `1px dashed ${T.border}`, borderRadius: '10px' }}>
            <Send size={24} color={T.textMut} style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '12px', color: T.textMut, fontFamily: T.fontBody }}>
              Envio individual ou em massa — com filtros por grupo, setor, status e lista de exclusão
            </div>
          </div>
        )}
      </div>

      {/* Lembretes Automáticos */}
      <div style={{
        padding: '16px 20px', backgroundColor: `${T.amber}08`, border: `1px solid ${T.amber}25`,
        borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px',
      }}>
        <Clock size={18} color={T.amber} />
        <div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, fontFamily: T.fontBody }}>Lembretes Automáticos</div>
          <div style={{ fontSize: '11px', color: T.textSec, fontFamily: T.fontBody, marginTop: '2px' }}>
            Automações agendadas disparam o filtro do grupo no horário configurado. Configure via aba "Automações" no painel.
          </div>
        </div>
      </div>
    </div>
  );
}