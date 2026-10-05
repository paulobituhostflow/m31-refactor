import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  ArrowLeft, ExternalLink, AlertTriangle, ShieldAlert, ShieldCheck,
  UserCheck, Users, RefreshCw, Loader2, Ban,
} from 'lucide-react';

const T = {
  bg: '#F7F5F2', card: '#FFFFFF', border: '#EAE7E2',
  text: '#2D2D2D', sec: '#6B7280', muted: '#B0ADA8', brand: '#A8344A',
};

function statusColor(status) {
  if (status === 'aprovado') return { bg: '#DCFCE7', fg: '#16A34A' };
  if (status === 'checkout_pendente') return { bg: '#FEF3C7', fg: '#B45309' };
  if (status === 'cancelado') return { bg: '#F3F4F6', fg: '#6B7280' };
  return { bg: '#F3F4F6', fg: '#6B7280' };
}

const brl = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function LinhaRegistro({ r, onCancel, cancelingId }) {
  const sc = statusColor(r.status_local);
  const isCanceling = cancelingId === r.id;

  return (
    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
      <td style={{ padding: '12px 10px', fontSize: '13px', color: T.text, fontWeight: 600 }}>
        {r.nome}
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {r.entrou_no_grupo && (
            <span style={{ fontSize: 10, background: '#EFF6FF', color: '#2563EB', padding: '2px 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Users size={10} /> No grupo
            </span>
          )}
          {r.checkin_realizado && (
            <span style={{ fontSize: 10, background: '#F0FDF4', color: '#16A34A', padding: '2px 6px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <UserCheck size={10} /> Check-in
            </span>
          )}
        </div>
      </td>
      <td style={{ padding: '12px 10px', fontSize: '13px', color: T.sec, whiteSpace: 'nowrap' }}>
        {r.whatsapp || '—'}
      </td>
      <td style={{ padding: '12px 10px', fontSize: '13px' }}>
        {r.sem_cpf ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#B45309', fontWeight: 600 }}>
            <AlertTriangle size={13} /> Sem CPF
          </span>
        ) : (
          <span style={{ color: T.sec }}>{r.cpf}</span>
        )}
      </td>
      <td style={{ padding: '12px 10px', fontSize: '13px', color: T.text, whiteSpace: 'nowrap' }}>
        {brl(r.valor_pago)}
      </td>
      <td style={{ padding: '12px 10px' }}>
        <span style={{ fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.fg, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
          {r.status_local}
        </span>
      </td>
      <td style={{ padding: '12px 10px', fontSize: '12px' }}>
        {r.envolve_dinheiro_real ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#DC2626', fontWeight: 700 }}>
            <ShieldAlert size={14} /> Dinheiro real
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16A34A', fontWeight: 600 }}>
            <ShieldCheck size={14} /> Só cadastro
          </span>
        )}
      </td>
      <td style={{ padding: '12px 10px' }}>
        <a href={r.asaas_link} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2563EB', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
          <ExternalLink size={13} /> Asaas
          <span style={{ fontSize: 10, color: T.muted }}>({r.asaas_busca_por})</span>
        </a>
      </td>
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        {r.seguro_cancelar_cadastro ? (
          <button
            onClick={() => onCancel(r)}
            disabled={isCanceling}
            style={{
              fontSize: 12, fontWeight: 600, color: '#B45309',
              background: '#FEF3C7', border: '1px solid #FDE68A',
              borderRadius: 8, padding: '6px 12px', cursor: isCanceling ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
            {isCanceling ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
            Cancelar cadastro
          </button>
        ) : (
          <span style={{ fontSize: 11, color: T.muted, fontStyle: 'italic' }}>
            decisão manual
          </span>
        )}
      </td>
    </tr>
  );
}

export default function M31RevisaoDuplicados() {
  const [loading, setLoading] = useState(true);
  const [grupos, setGrupos] = useState([]);
  const [cancelingId, setCancelingId] = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('m31ListarDuplicadosRevisao', {});
      setGrupos(res.data?.grupos || []);
    } catch (e) {
      toast.error('Erro ao carregar duplicados');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(r) {
    // Confirmação explícita, individual, por linha.
    const ok = window.confirm(
      `Cancelar o CADASTRO de "${r.nome}" (${r.whatsapp || 'sem telefone'})?\n\n` +
      `Status: ${r.status_local} · ${brl(r.valor_pago)}\n` +
      `Este registro NÃO tem pagamento associado (só organização de cadastro).\n` +
      `Nenhum dinheiro será movido. Confirmar?`
    );
    if (!ok) return;

    setCancelingId(r.id);
    try {
      const res = await base44.functions.invoke('m31CancelarCadastroDuplicado', { inscricao_id: r.id });
      if (res.data?.success) {
        toast.success(`Cadastro de ${r.nome} cancelado`);
        await carregar();
      } else {
        toast.error(res.data?.error || 'Não foi possível cancelar');
      }
    } catch (e) {
      const msg = e?.response?.data?.error || 'Bloqueado — envolve dinheiro real ou erro';
      toast.error(msg);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <div style={{
        background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${T.border}`, padding: '14px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        position: 'sticky', top: 0, zIndex: 20,
      }}>
        <div>
          <a href="/admin" style={{ fontSize: 12, color: T.brand, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
            <ArrowLeft size={13} /> Voltar
          </a>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, fontFamily: 'Inter, sans-serif', color: T.text }}>
            Revisão manual de duplicados
          </h1>
        </div>
        <button onClick={carregar} disabled={loading}
          style={{ background: '#F3F0EE', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, color: T.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
        {/* Aviso da trava */}
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 16px', marginBottom: 20, display: 'flex', gap: 10 }}>
          <ShieldAlert size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.5 }}>
            <strong>Trava de dinheiro real.</strong> Nada aqui move dinheiro. Só é possível cancelar
            cadastros <em>checkout_pendente sem pagamento associado</em> (marcados “Só cadastro”).
            Registros marcados <strong>“Dinheiro real”</strong> exigem decisão manual sua no Asaas —
            não há botão para eles. Cada ação é individual, uma por vez, com sua confirmação.
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Loader2 size={28} className="animate-spin" color={T.brand} />
          </div>
        ) : grupos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: T.sec }}>Nenhum duplicado encontrado.</div>
        ) : (
          grupos.map((g) => (
            <div key={g.termo} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text, textTransform: 'capitalize', marginBottom: 8 }}>
                {g.termo} <span style={{ fontSize: 12, fontWeight: 500, color: T.sec }}>· {g.total} registro(s)</span>
              </h2>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: '#FAF9F7', borderBottom: `1px solid ${T.border}` }}>
                      {['Nome', 'WhatsApp', 'CPF', 'Valor', 'Status', 'Natureza', 'Conferir', 'Ação'].map(h => (
                        <th key={h} style={{ padding: '10px', textAlign: h === 'Ação' ? 'right' : 'left', fontSize: 11, fontWeight: 600, color: T.sec, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.registros.map(r => (
                      <LinhaRegistro key={r.id} r={r} onCancel={handleCancel} cancelingId={cancelingId} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}