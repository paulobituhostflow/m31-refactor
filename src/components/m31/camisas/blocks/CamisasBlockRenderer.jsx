import CamisasHeroBlock from './CamisasHeroBlock';

// Renderizador de blocos da Lojinha (tema claro). O bloco 'purchase_flow'
// recebe o fluxo interativo montado pela página; os demais são renderizados aqui.
export default function CamisasBlockRenderer({ block, purchaseFlow }) {
  const d = block.data || {};
  switch (block.type) {
    case 'camisas_hero':
      return <CamisasHeroBlock data={d} />;
    case 'purchase_flow':
      return purchaseFlow || null;
    case 'verse':
      return (
        <section style={{ padding: '4px 0' }}>
          <div style={{ background: '#FFF8F1', borderLeft: '3px solid #8B1F24', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
            <p style={{ fontStyle: 'italic', fontSize: 15, lineHeight: 1.6, color: '#4A3D38', margin: d.reference ? '0 0 6px' : 0 }}>"{d.text}"</p>
            {d.reference && <span style={{ fontSize: 12, fontWeight: 700, color: '#8B1F24' }}>{d.reference}</span>}
          </div>
        </section>
      );
    case 'custom_html':
      return <div style={{ marginBottom: 12 }} dangerouslySetInnerHTML={{ __html: d.html || '' }} />;
    case 'divider':
      return <hr style={{ border: 0, borderTop: '1px solid #E8E0D4', margin: '12px 0' }} />;
    case 'footer':
      return (
        <footer style={{ textAlign: 'center', padding: '6px 12px 18px' }}>
          {d.security_text && <div style={{ fontSize: 12, color: '#8B7770', marginBottom: 4 }}>{d.security_text}</div>}
          {d.footer_text && <div style={{ fontSize: 11, color: '#B0A296' }}>{d.footer_text}</div>}
        </footer>
      );
    default:
      return null;
  }
}