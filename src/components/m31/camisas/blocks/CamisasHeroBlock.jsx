
// Banner oficial da Lojinha (imagem) — substitui o cabeçalho tipográfico.
// data: banner_url, subtitle
export const BANNER_CAMISAS_URL = '/assets/d8b6b1f1a_E7FBA259-1F2F-4DEC-8DD3-C4ED91F9CAF9.png';

export default function CamisasHeroBlock({ data = {} }) {
  const d = {
    banner_url: data.banner_url || BANNER_CAMISAS_URL,
    subtitle: data.subtitle !== undefined ? data.subtitle : 'Selecione o modelo, a cor e o tamanho 💛',
  };
  return (
    <header style={{ padding: '16px 0 4px' }}>
      <img src={d.banner_url} alt="Camisas M31 Filhas — Pré-venda promocional" style={{ width: '100%', display: 'block', borderRadius: 20, border: '1px solid #E8E0D4', boxShadow: '0 12px 32px rgba(94,56,43,.10)' }} />
      {d.subtitle && (
        <p style={{ margin: '14px 0 12px', textAlign: 'center', fontSize: 15, color: '#5C5148', lineHeight: 1.45 }}>{d.subtitle}</p>
      )}
    </header>
  );
}