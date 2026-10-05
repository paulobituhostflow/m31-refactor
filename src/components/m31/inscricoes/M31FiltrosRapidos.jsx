
const CONF = ['aprovado', 'gratuito'];
const PEND = ['pendente', 'checkout_pendente', 'checkout_abandonado'];

export const QUICK_FILTERS = [
  { id: 'todas',             label: 'Todas',                 fn: () => true },
  { id: 'pagas',             label: 'Pagas',                 fn: i => CONF.includes(i.status_pagamento) },
  { id: 'pendentes',         label: 'Pendentes',             fn: i => PEND.includes(i.status_pagamento) },
  { id: 'sem_bv',            label: 'Sem boas-vindas',       fn: i => CONF.includes(i.status_pagamento) && !i.data_envio_boas_vindas },
  { id: 'sem_qr',            label: 'Sem QR Code',           fn: i => CONF.includes(i.status_pagamento) && i.qr_envio_status !== 'enviado_com_sucesso' },
  { id: 'sem_grupo',         label: 'Sem grupo',             fn: i => CONF.includes(i.status_pagamento) && i.status_envio_grupo !== 'enviado' },
  { id: 'entraram',          label: 'Entraram no grupo',     fn: i => !!i.entrou_no_grupo },
  { id: 'nao_entraram',      label: 'Não entraram',          fn: i => CONF.includes(i.status_pagamento) && !i.entrou_no_grupo },
  { id: 'checkin',           label: 'Check-in ✓',            fn: i => !!i.checkin_realizado },
  { id: 'cartinha_pendente', label: 'Cartinha pendente',     fn: i => CONF.includes(i.status_pagamento) && (!i.cartinha_status || i.cartinha_status === 'pendente') },
  { id: 'cartinha_pronta',   label: 'Cartinha pronta',       fn: i => ['pronta', 'entregue'].includes(i.cartinha_status) },
  { id: 'terceiro',          label: 'Pagas por outra pessoa', fn: i => !!i.pagador_nome },
  { id: 'pendencia_conciliacao', label: 'Pend. conciliação', fn: i => ['aprovado','gratuito'].includes(i.status_pagamento) && i.origem_pagamento === 'desconhecida' },
];

export default function M31FiltrosRapidos({ list, ativo, onChange }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-none pb-2 mb-3">
      {QUICK_FILTERS.map(f => {
        const count = f.id === 'todas' ? list.length : list.filter(f.fn).length;
        const isAtivo = ativo === f.id;
        return (
          <button
            key={f.id}
            onClick={() => onChange(f.id)}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 11px', borderRadius: '100px', cursor: 'pointer',
              fontFamily: 'Inter,sans-serif', fontSize: '12px',
              fontWeight: isAtivo ? '600' : '500',
              background: isAtivo ? '#8B1A2B' : '#ffffff',
              color: isAtivo ? '#fff' : '#6b7280',
              border: `1px solid ${isAtivo ? '#8B1A2B' : 'rgba(0,0,0,0.1)'}`,
              whiteSpace: 'nowrap', transition: 'all .12s',
            }}
          >
            {f.label}
            <span style={{ fontSize: '10.5px', fontWeight: '700', opacity: isAtivo ? 0.9 : 0.6 }}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}