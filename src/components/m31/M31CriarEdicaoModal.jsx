import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { X, CopyPlus, Loader, Calendar, Check, AlertTriangle, Package, ListChecks } from 'lucide-react';

const T = {
  bg: '#F7F5F2', card: '#FFFFFF', border: '#EAE7E2',
  text: '#2D2D2D', sec: '#6B7280', muted: '#B0ADA8',
  brand: '#8B1A2B', brandDark: '#6B1422', brandTint: '#F6E9EC',
  success: '#16A34A', successSoft: '#DCFCE7',
  danger: '#DC2626', dangerSoft: '#FEE2E2',
  input: '#FFFFFF', inputB: '#D1D5DB',
};

export default function M31CriarEdicaoModal({ onClose, onSuccess, userEmail }) {
  const [nome, setNome] = useState('');
  const [dataEvento, setDataEvento] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(null);

  // Pré-carregar dados do Plano-Mestre ativo para preview
  const planoQ = useQuery({
    queryKey: ['m31_plano_mestre_ativo'],
    queryFn: async () => {
      const planos = await base44.entities.M31PlanoMestre.filter({ ativo: true });
      return planos?.[0] || null;
    },
  });

  const previewQ = useQuery({
    queryKey: ['m31_preview_clone', planoQ.data?.id],
    queryFn: async () => {
      if (!planoQ.data?.id) return { pacotes: 0, tarefas: 0, areas: [] };
      const [pacotes, tarefas] = await Promise.all([
        base44.entities.M31PacoteModelo.filter({ plano_mestre_id: planoQ.data.id, ativo: true }),
        base44.entities.M31TarefaModelo.filter({ plano_mestre_id: planoQ.data.id, ativo: true }),
      ]);
      const areas = [...new Set(pacotes.map(p => p.area))];
      return { pacotes: pacotes.length, tarefas: tarefas.length, areas };
    },
    enabled: !!planoQ.data?.id,
  });

  // Sugestão automática de nome baseado no ano da data
  useEffect(() => {
    if (dataEvento && !nome) {
      const ano = new Date(dataEvento + 'T12:00:00').getFullYear();
      setNome(`M31 Filhas ${ano}`);
    }
  }, [dataEvento]);

  async function handleCriar() {
    setErro(null);
    if (!nome.trim()) { setErro('Informe o nome da edição.'); return; }
    if (!dataEvento) { setErro('Informe a data do evento.'); return; }

    setCriando(true);
    try {
      const res = await base44.functions.invoke('m31CriarEdicao', {
        nome_edicao: nome.trim(),
        data_evento: dataEvento,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSucesso(res.data);
      onSuccess?.(res.data);
    } catch (e) {
      setErro(e.message || 'Erro ao criar edição');
    }
    setCriando(false);
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', background: T.input,
    border: `1.5px solid ${T.inputB}`, borderRadius: '8px',
    fontSize: '14px', color: T.text, outline: 'none',
    fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
  };

  const podeCriar = nome.trim() && dataEvento && !criando && !sucesso;
  const preview = previewQ.data;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget && !criando) onClose(); }}
    >
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: '16px',
        width: '520px', maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px', background: T.brandTint,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CopyPlus size={18} color={T.brand} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: T.text }}>Nova Edição</div>
              <div style={{ fontSize: '12px', color: T.sec }}>
                Clona o Plano-Mestre ativo em uma operação completa
              </div>
            </div>
          </div>
          {!criando && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.muted, padding: '4px' }}>
              <X size={18} />
            </button>
          )}
        </div>

        <div style={{ padding: '24px' }}>
          {sucesso ? (
            /* ── Sucesso ── */
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%', background: T.successSoft,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px',
              }}>
                <Check size={24} color={T.success} strokeWidth={3} />
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: T.text, marginBottom: '4px' }}>
                Edição criada com sucesso!
              </div>
              <div style={{ fontSize: '13px', color: T.sec, marginBottom: '20px' }}>
                {sucesso.mensagem}
              </div>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px',
                background: T.bg, borderRadius: '10px', padding: '14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <Package size={16} color={T.brand} />
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: T.text }}>{sucesso.resumo.pacotes_clonados}</div>
                    <div style={{ fontSize: '11px', color: T.sec }}>Pacotes</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                  <ListChecks size={16} color={T.brand} />
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: T.text }}>{sucesso.resumo.tarefas_clonadas}</div>
                    <div style={{ fontSize: '11px', color: T.sec }}>Tarefas</div>
                  </div>
                </div>
              </div>
              <button onClick={onClose} style={{
                padding: '10px 24px', background: T.brand, color: '#fff', border: 'none',
                borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
              }}>
                Concluir
              </button>
            </div>
          ) : (
            /* ── Formulário ── */
            <>
              {/* Preview do que será clonado */}
              {planoQ.isLoading ? (
                <div style={{ textAlign: 'center', padding: '24px', color: T.muted, fontSize: '13px' }}>
                  <Loader size={20} color={T.brand} style={{ animation: 'spin 1s linear infinite' }} />
                  <div style={{ marginTop: '8px' }}>Carregando Plano-Mestre…</div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : !planoQ.data ? (
                <div style={{
                  padding: '14px', background: T.dangerSoft, border: `1px solid ${T.danger}33`,
                  borderRadius: '10px', fontSize: '13px', color: T.danger, marginBottom: '16px',
                  display: 'flex', gap: '8px', alignItems: 'flex-start',
                }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    <strong>Nenhum Plano-Mestre ativo encontrado.</strong>
                    <div style={{ fontSize: '12px', marginTop: '2px' }}>
                      Execute a migração inicial antes de criar uma nova edição.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{
                  padding: '14px 16px', background: T.brandTint, border: `1px solid ${T.brand}22`,
                  borderRadius: '10px', marginBottom: '20px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: T.brand, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                    Plano-Mestre v{planoQ.data.versao} será clonado
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    <div>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: T.text }}>{preview?.pacotes ?? '…'}</span>
                      <span style={{ fontSize: '12px', color: T.sec, marginLeft: '4px' }}>pacotes</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: T.text }}>{preview?.tarefas ?? '…'}</span>
                      <span style={{ fontSize: '12px', color: T.sec, marginLeft: '4px' }}>tarefas</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: T.text }}>{preview?.areas?.length ?? '…'}</span>
                      <span style={{ fontSize: '12px', color: T.sec, marginLeft: '4px' }}>áreas</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Nome */}
              <label style={{
                fontSize: '12px', fontWeight: '600', color: T.sec, display: 'block', marginBottom: '6px',
              }}>
                Nome da edição
              </label>
              <input
                style={{ ...inputStyle, marginBottom: '16px' }}
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: M31 Filhas 2027"
                disabled={criando}
              />

              {/* Data */}
              <label style={{
                fontSize: '12px', fontWeight: '600', color: T.sec, display: 'block', marginBottom: '6px',
              }}>
                Data do evento
              </label>
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <input
                  type="date"
                  style={{ ...inputStyle, paddingRight: '36px' }}
                  value={dataEvento}
                  onChange={e => { setDataEvento(e.target.value); setNome(''); }}
                  disabled={criando}
                />
                <Calendar size={16} color={T.muted} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>

              {/* Info: o que é ajustado vs. preservado */}
              <div style={{
                padding: '12px 14px', background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: '10px', marginBottom: '20px', fontSize: '12px', color: T.sec,
              }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                  <Check size={14} color={T.success} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span><strong style={{ color: T.text }}>Recalculado:</strong> prazos concretos a partir da nova data</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                  <Check size={14} color={T.success} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span><strong style={{ color: T.text }}>Em branco:</strong> responsáveis (atribuídos por edição)</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <Check size={14} color={T.success} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span><strong style={{ color: T.text }}>Preservado:</strong> histórico da edição anterior (intacto)</span>
                </div>
              </div>

              {erro && (
                <div style={{
                  padding: '10px 12px', background: T.dangerSoft, border: `1px solid ${T.danger}33`,
                  borderRadius: '8px', fontSize: '13px', color: T.danger, marginBottom: '16px',
                }}>
                  {erro}
                </div>
              )}

              {/* Ações */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={onClose}
                  disabled={criando}
                  style={{
                    flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${T.border}`,
                    borderRadius: '8px', color: T.sec, fontSize: '14px', fontWeight: '600',
                    cursor: criando ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCriar}
                  disabled={!podeCriar}
                  style={{
                    flex: 2, padding: '10px', background: podeCriar ? T.brand : '#D1D5DB', border: 'none',
                    borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '600',
                    cursor: podeCriar ? 'pointer' : 'not-allowed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  }}
                >
                  {criando ? (
                    <><Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Clonando…</>
                  ) : (
                    <><CopyPlus size={16} /> Criar edição</>
                  )}
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}