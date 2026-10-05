import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const GATEWAYS = [
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'asaas', label: 'Asaas' },
  { value: 'stone', label: 'Stone' },
  { value: 'pix_manual', label: 'Pix manual' },
  { value: 'importacao', label: 'Importação legado' },
  { value: 'gratuidade', label: 'Cortesia / isenta' },
];

const STATUS = [
  { value: 'aprovado', label: 'Pagamento confirmado' },
  { value: 'pendente', label: 'Ainda pendente' },
  { value: 'cancelado', label: 'Cancelada' },
  { value: 'gratuito', label: 'Isenta / gratuito' },
];

const ERROS = {
  inscricao_ja_confirmada_com_evidencia: 'Esta inscrição já está confirmada com evidência concreta. O vínculo manual não pode sobrescrever.',
  session_expired: 'Sessão expirada. Entre novamente na gestão.',
  operational_scope_forbidden: 'Sua sessão não tem permissão de inscritas.',
  forbidden: 'Seu perfil não permite esta operação.',
  parametros_invalidos: 'Selecione o gateway e o status antes de confirmar.',
};

export default function M31VinculoPagamento({ inscricao, sessionId, onDone, onCancel }) {
  const [gateway, setGateway] = useState('');
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const selectCls = 'min-h-12 w-full rounded-xl border border-m31-border bg-white px-3 text-sm font-medium text-m31-ink';

  async function confirmar() {
    if (!gateway || !status) { setErro(ERROS.parametros_invalidos); return; }
    setSalvando(true); setErro('');
    try {
      const res = await base44.functions.invoke('m31VincularPagamentoManual', {
        session_id: sessionId,
        inscricao_id: inscricao.id,
        gateway,
        status_pagamento: status,
      });
      const d = res?.data || res;
      if (d?.ok) onDone(d);
      else setErro(ERROS[d?.error] || d?.error || 'Não foi possível consolidar a inscrição.');
    } catch (e) {
      setErro(ERROS[e?.response?.data?.error] || 'Falha de conexão. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-xl border border-m31-border bg-m31-surface-warm p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-m31-ink">
        <Link2 aria-hidden="true" className="h-4 w-4 text-m31-primary" />
        Vínculo manual de pagamento
      </p>
      <p className="mt-1 text-xs leading-5 text-m31-text-muted">
        Use quando o pagamento existe mas o sistema não o vinculou. O vínculo é registrado em seu nome na auditoria.
      </p>
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-m31-text-muted">Gateway original</label>
      <select value={gateway} onChange={(e) => setGateway(e.target.value)} className={`mt-1 ${selectCls}`}>
        <option value="">Selecionar gateway…</option>
        {GATEWAYS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
      </select>
      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-m31-text-muted">Status do pagamento</label>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={`mt-1 ${selectCls}`}>
        <option value="">Selecionar status…</option>
        {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{erro}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="min-h-12 rounded-xl border border-m31-border bg-white font-bold text-m31-text-muted">Voltar</button>
        <button
          type="button"
          onClick={confirmar}
          disabled={salvando || !gateway || !status}
          className="min-h-12 rounded-xl bg-m31-primary font-bold text-white disabled:opacity-40"
        >
          {salvando ? 'Consolidando…' : 'Consolidar inscrição'}
        </button>
      </div>
    </div>
  );
}