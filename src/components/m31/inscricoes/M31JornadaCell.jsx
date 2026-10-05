
// Deriva o estado da jornada a partir dos campos existentes da inscrição
export function getJornada(i) {
  return {
    bv: !!i.data_envio_boas_vindas,
    qr: i.qr_envio_status === 'enviado_com_sucesso',
    grupo: i.status_envio_grupo === 'enviado',
    entrou: !!i.entrou_no_grupo,
    checkin: !!i.checkin_realizado,
    cartinha: i.cartinha_status || 'pendente',
  };
}

// Ícones distintos por etapa (SVG inline) — cada etapa tem um símbolo próprio
const Ico = {
  bv: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>,          // envelope (boas-vindas)
  qr: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="14"/><line x1="21" y1="14" x2="21" y2="14"/><line x1="14" y1="21" x2="14" y2="21"/><line x1="21" y1="21" x2="21" y2="21"/><line x1="17.5" y1="17.5" x2="17.5" y2="17.5"/></svg>, // QR
  grupo: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>,  // link (link do grupo)
  entrou: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>, // entrar (entrou no grupo)
  checkin: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>, // check-in
  cartinha: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>, // documento (cartinha)
};

export const ETAPAS = [
  { key: 'bv', label: 'Boas-vindas', icon: Ico.bv },
  { key: 'qr', label: 'QR Code', icon: Ico.qr },
  { key: 'grupo', label: 'Link do grupo', icon: Ico.grupo },
  { key: 'entrou', label: 'Entrou no grupo', icon: Ico.entrou },
  { key: 'checkin', label: 'Check-in', icon: Ico.checkin },
];

const CARTINHA_COLOR = { pendente: '#d1d5db', em_elaboracao: '#f59e0b', pronta: '#10b981', entregue: '#10b981' };
const CARTINHA_LABEL = { pendente: 'Cartinha: pendente', em_elaboracao: 'Cartinha: em elaboração', pronta: 'Cartinha: pronta', entregue: 'Cartinha: entregue' };

function StepIcon({ done, title, Icon, color, onClick }) {
  const c = color || (done ? '#10b981' : '#d1d5db');
  const inner = <Icon width="12" height="12" style={{ display: 'block' }} />;
  const baseStyle = {
    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: done ? 'rgba(16,185,129,0.1)' : 'transparent',
    color: c, border: `1.5px solid ${c}`,
  };
  if (onClick) {
    return (
      <button
        title={title}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        style={{ ...baseStyle, cursor: 'pointer', padding: 0, transition: 'transform .12s' }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {inner}
      </button>
    );
  }
  return <span title={title} style={baseStyle}>{inner}</span>;
}

// onEtapa(key, inscricao) — quando informado, cada etapa acionável vira um botão clicável
export function JornadaDots({ inscricao, onEtapa }) {
  const j = getJornada(inscricao);
  const cartinhaDone = ['pronta', 'entregue'].includes(j.cartinha);
  return (
    <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
      {ETAPAS.map(e => (
        <StepIcon
          key={e.key}
          done={j[e.key]}
          Icon={e.icon}
          title={`${e.label}: ${j[e.key] ? 'concluído' : 'pendente'}${onEtapa ? ' · clique para disparar' : ''}`}
          onClick={onEtapa ? () => onEtapa(e.key, inscricao) : undefined}
        />
      ))}
      <StepIcon
        done={cartinhaDone}
        Icon={Ico.cartinha}
        color={CARTINHA_COLOR[j.cartinha]}
        title={CARTINHA_LABEL[j.cartinha]}
      />
    </div>
  );
}

// Legenda dos ícones da jornada — mostra o que cada símbolo representa
export function JornadaLegenda({ color }) {
  const items = [...ETAPAS, { key: 'cartinha', label: 'Cartinha', icon: Ico.cartinha }];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
      {items.map(e => {
        const Icon = e.icon;
        return (
          <span key={e.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: color || '#6b7280' }}>
            <span style={{
              width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#9ca3af', border: '1.5px solid #d1d5db',
            }}>
              <Icon width="11" height="11" style={{ display: 'block' }} />
            </span>
            {e.label}
          </span>
        );
      })}
    </div>
  );
}