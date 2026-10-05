import { useEffect, useState } from 'react';
import { TAMANHOS } from '../camisasCatalog';
import { DEFAULT_CAMISAS_TEXTOS } from '../camisasLandingConfig';
import ShirtGalleryLightbox from './ShirtGalleryLightbox';

const brl = v => Number(v || 0).toFixed(2).replace('.', ',');
const CORES_JESUS = [['cereja', '#8B1F3A'], ['preta', '#111111']];
const VINHO = '#7A2228';

// Feedback tátil leve (Android/Chrome; iOS ignora silenciosamente).
const haptic = () => { try { navigator.vibrate?.(8); } catch {} };

const styles = {
  card: { background: '#FFFDFB', border: '1px solid #E8E0D4', borderRadius: 18, padding: 16, boxShadow: '0 8px 30px rgba(94,56,43,.06)' },
  title: { fontSize: 18, margin: '0 0 14px' },
  modelBox: { borderTop: '1px solid #EEE2DC', paddingTop: 14, marginTop: 14 },
  modelHead: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 },
  thumb: { width: 52, height: 52, objectFit: 'cover', borderRadius: 10, border: '1px solid rgba(0,0,0,.06)', display: 'block' },
  thumbWrap: { flexShrink: 0, cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'center' },
  verDetalhes: { fontSize: 11, color: VINHO, fontWeight: 600, marginTop: 3, letterSpacing: '.01em' },
  modelName: { fontWeight: 700, fontSize: 14 },
  frase: { fontSize: 11, color: '#7A6861', marginTop: 2 },
  fixedColor: { display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, fontWeight: 700, color: '#65544D' },
  fixedColorDot: { width: 12, height: 12, borderRadius: '50%', border: '1px solid rgba(74,61,56,.2)', display: 'inline-block' },
  qtyBadge: { marginLeft: 'auto', background: '#F6E9EC', color: VINHO, fontWeight: 800, fontSize: 12, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' },
  smallLabel: { fontSize: 12, fontWeight: 800, color: '#65544D', margin: '10px 0 7px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 7 },
  chip: { width: 38, height: 38, border: '2px solid #FFF', borderRadius: '50%', padding: 0, cursor: 'pointer', transition: 'transform 160ms, box-shadow 160ms, border-color 160ms' },
  chipOn: { transform: 'scale(1.08)', boxShadow: `0 0 0 2px ${VINHO}` },
  chipDisabled: { opacity: 0.5, cursor: 'default' },
  chipCheck: { marginLeft: 5, fontSize: 11, verticalAlign: 'middle' },
  // Cápsula de quantidade — secundária, alinhada à direita
  capRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, transition: 'opacity 160ms ease-out, transform 160ms ease-out' },
  capLabel: { fontWeight: 700, fontSize: 13, color: '#4A3D38' },
  capsule: { display: 'flex', alignItems: 'center', border: '1px solid #E0D5CE', borderRadius: 999, background: '#FFF', overflow: 'hidden' },
  capBtn: { width: 28, height: 28, border: 'none', background: 'transparent', color: '#4A3D38', fontSize: 15, fontWeight: 800, cursor: 'pointer', lineHeight: 1 },
  capVal: { minWidth: 20, textAlign: 'center', fontSize: 13, fontWeight: 800, color: '#4A3D38' },
  subtotal: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '2px solid ' + VINHO },
  subtotalInfo: { color: '#7A6861', fontWeight: 600, fontSize: 14 },
  subtotalTotal: { fontWeight: 800, fontSize: 20, color: VINHO, whiteSpace: 'nowrap' },
};

// Cápsula "− 1 +" — aparece com transição suave de ~160ms.
function QtdCapsule({ tamanho, quantidade, bloqueado, onDelta }) {
  const [anim, setAnim] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnim(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div style={{ ...styles.capRow, opacity: anim ? 1 : 0, transform: anim ? 'translateY(0)' : 'translateY(-3px)' }}>
      <span style={styles.capLabel}>{tamanho}</span>
      <div style={styles.capsule}>
        <button type="button" style={styles.capBtn} onClick={() => onDelta(-1)} aria-label={`Diminuir ${tamanho}`}>−</button>
        <span style={styles.capVal}>{quantidade}</span>
        <button
          type="button"
          style={{ ...styles.capBtn, opacity: bloqueado ? 0.4 : 1, cursor: bloqueado ? 'default' : 'pointer' }}
          onClick={() => onDelta(1)}
          disabled={bloqueado}
          aria-label={`Aumentar ${tamanho}`}
        >+</button>
      </div>
    </div>
  );
}

// Divulgação progressiva: chips de tamanho sempre visíveis; ao tocar,
// o chip fica vinho com ✓ e a cápsula de quantidade aparece abaixo.
function SizeChips({ modeloId, corId, quantidades, bloqueado, onDelta, t }) {
  return (
    <div>
      <div style={styles.smallLabel}>{t.selecao_tamanho}</div>
      <div style={styles.chips}>
        {TAMANHOS.map((tamanho) => {
          const qtd = Number(quantidades[`${modeloId}|${corId}|${tamanho}`] || 0);
          const selecionado = qtd > 0;
          return (
            <button
              key={tamanho}
              type="button"
              disabled={bloqueado && !selecionado}
              onClick={() => { haptic(); onDelta(modeloId, corId, tamanho, selecionado ? -qtd : 1); }}
              style={{
                ...styles.chip,
                ...(selecionado ? styles.chipOn : {}),
                ...(bloqueado && !selecionado ? styles.chipDisabled : {}),
              }}
              aria-pressed={selecionado}
            >
              {tamanho}{selecionado && <span style={styles.chipCheck}>✓</span>}
            </button>
          );
        })}
      </div>
      {TAMANHOS.filter((tam) => Number(quantidades[`${modeloId}|${corId}|${tam}`] || 0) > 0).map((tam) => (
        <QtdCapsule
          key={tam}
          tamanho={tam}
          quantidade={Number(quantidades[`${modeloId}|${corId}|${tam}`])}
          bloqueado={bloqueado}
          onDelta={(delta) => onDelta(modeloId, corId, tam, delta)}
        />
      ))}
    </div>
  );
}

// Etapa 2: GRADE UNIFICADA — estilo Apple de divulgação progressiva.
// Tamanho = escolha (chip vinho ✓); quantidade = consequência (cápsula
// secundária). Quantidade zero devolve o chip ao estado normal.
export default function ShirtSelectionBlock({ modelos, quantidades: qtds, precoUnit, total, loading, onQuantidade, tx }) {
  const t = { ...DEFAULT_CAMISAS_TEXTOS, ...(tx || {}) };
  const quantidades = qtds || {};
  const quantidadeTotal = Object.values(quantidades).reduce((soma, q) => soma + Number(q || 0), 0);
  const bloqueado = loading || quantidadeTotal >= 20;
  const itemLabel = t.selecao_item.toLowerCase();
  const onDelta = (modelo, cor, tamanho, delta) => onQuantidade(modelo, cor, tamanho, delta);

  // Nenhuma cor vem pré-selecionada: a compradora precisa escolher conscientemente.
  const [corAtivaJesus, setCorAtivaJesus] = useState('');
  const [galeriaAberta, setGaleriaAberta] = useState(null);

  return (
    <section style={styles.card}>
      <h2 style={styles.title}>{t.selecao_titulo}</h2>
      <p style={{ margin: '-4px 0 14px', fontSize: 15, fontWeight: 650, color: '#6D5B53' }}>📍 Retirada presencial</p>
      {modelos.map((m) => {
        const ehJesus = m.id === 'jesus';
        const qtdModelo = ehJesus
          ? CORES_JESUS.reduce((soma, [corId]) => soma + TAMANHOS.reduce((acc, tam) => acc + Number(quantidades[`${m.id}|${corId}|${tam}`] || 0), 0), 0)
          : TAMANHOS.reduce((acc, tam) => acc + Number(quantidades[`${m.id}||${tam}`] || 0), 0);
        return (
          <div key={m.id} style={styles.modelBox}>
            <div style={styles.modelHead}>
              <button type="button" style={styles.thumbWrap} onClick={() => setGaleriaAberta(m)} aria-label={`Ver detalhes da camisa ${m.nome}`}>
                <img src={m.foto} alt={`Camisa ${m.nome}`} style={styles.thumb} />
                <span style={styles.verDetalhes}>Ver detalhes</span>
              </button>
              <div>
                <div style={styles.modelName}>{m.nome}</div>
                <div style={styles.frase}>{m.frase}</div>
                {m.cor_nome && (
                  <div style={styles.fixedColor} aria-label={`Cor selecionada: ${m.cor_nome}`}>
                    <span aria-hidden="true" style={{ ...styles.fixedColorDot, background: m.cor_hex }} />
                    Cor selecionada: {m.cor_nome}
                  </div>
                )}
              </div>
              {qtdModelo > 0 && <span style={styles.qtyBadge}>{qtdModelo}</span>}
            </div>

            {ehJesus ? (
              <div>
                <div style={styles.smallLabel}>{t.selecao_cor}</div>
                <div style={styles.chips}>
                  {CORES_JESUS.map(([corId, corHex]) => {
                    const qtdCor = TAMANHOS.reduce((acc, tam) => acc + Number(quantidades[`${m.id}|${corId}|${tam}`] || 0), 0);
                    const ativa = corAtivaJesus === corId;
                    return (
                      <button
                        key={corId}
                        type="button"
                        onClick={() => { haptic(); setCorAtivaJesus(corId); }}
                        style={{
                          ...styles.chip,
                          background: corHex,
                          ...(ativa ? styles.chipOn : {}),
                        }}
                        aria-pressed={ativa}
                        aria-label={`Selecionar cor ${corId}`}
                        title={corId === 'cereja' ? 'Cereja' : 'Preta'}
                      >
                        {qtdCor > 0 && <span style={{ position:'absolute', width:18, height:18, borderRadius:'50%', background:'#FFF', color:'#4A3D38', fontSize:10, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center', transform:'translate(12px,-13px)', boxShadow:'0 1px 3px rgba(0,0,0,.2)' }}>{qtdCor}</span>}
                      </button>
                    );
                  })}
                </div>
                {corAtivaJesus ? (
                  <SizeChips modeloId={m.id} corId={corAtivaJesus} quantidades={quantidades} bloqueado={bloqueado} onDelta={onDelta} t={t} />
                ) : (
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>Escolha uma cor para selecionar o tamanho.</div>
                )}
              </div>
            ) : (
              <SizeChips modeloId={m.id} corId="" quantidades={quantidades} bloqueado={bloqueado} onDelta={onDelta} t={t} />
            )}
          </div>
        );
      })}
      <div style={styles.subtotal}>
        <span style={styles.subtotalInfo}>
          {quantidadeTotal === 1 ? `1 ${itemLabel}` : `${quantidadeTotal} ${itemLabel}s`} · R$ {brl(precoUnit)} {t.selecao_cada}
        </span>
        <span style={styles.subtotalTotal}>R$ {brl(total)}</span>
      </div>

      {galeriaAberta && <ShirtGalleryLightbox modelo={galeriaAberta} onClose={() => setGaleriaAberta(null)} />}
    </section>
  );
}