import { useState, useRef, useMemo, useLayoutEffect, useEffect } from "react";
import { normalizarCartinhaImpressao, MARCA_CARTINHAS } from "./cartinhaImpressao";

/* ============================================================================
   M31CartinhasPrint.jsx  —  Folha de impressão das cartinhas
   ----------------------------------------------------------------------------
   Print-only. Não altera o painel de gestão.

   A página é um RETÂNGULO A4 de tamanho fixo. O preview pagina de verdade em
   páginas-retângulo (escaladas p/ caber na tela) e ESSAS mesmas páginas de
   tamanho fixo são o que imprime — WYSIWYG.

   Padrão: A4 RETRATO, 2 colunas — máximo aproveitamento sem frente/verso.
   Registro cru { nome, cartinha_texto } é normalizado.
   ============================================================================ */

const PX_PER_MM = 96 / 25.4;
const MARGIN_MM = 8;    // margem interna da página (compacta)
const GAP_MM = 5;       // espaço entre colunas
const CARD_GAP_MM = 4;  // espaço vertical entre cartinhas

export function CartinhaImpressa({ c }) {
  return (
    <article className="m31cp-cartinha" data-inscricao-id={c.id}>
      <img src={MARCA_CARTINHAS} alt="" aria-hidden="true" className="m31cp-marca" />
      <div className="m31cp-conteudo">
        <header className="m31cp-nome">{c.saudacao}</header>
        {c.paragrafos.map((p, j) => <p className="m31cp-p" key={j}>{p}</p>)}
        <p className="m31cp-sig">{c.assinatura}</p>
        <footer className="m31cp-identificacao">
          <span>{c.nomeCompleto}</span>
          {c.codigo && <span>Inscrição: {c.codigo}</span>}
        </footer>
      </div>
    </article>
  );
}

export default function M31CartinhasPrint({ cartinhas = [], onBeforePrint, verificadoEm, escopo = 'inscritas' }) {
  const [conferindo,setConferindo] = useState(false);
  const [aviso,setAviso] = useState('');
  // Impressão pelo menu/atalho do navegador não passa pela conferência do
  // botão: se a lista foi carregada há mais de 10 minutos, o aviso aparece
  // dentro da própria folha impressa para evitar versão desatualizada.
  const [avisoImpressao,setAvisoImpressao] = useState('');
  useEffect(() => {
    if (!verificadoEm) return;
    const verificar = () => {
      setAvisoImpressao(Date.now() - verificadoEm > 10 * 60 * 1000
        ? 'A lista foi carregada há mais de 10 minutos e pode estar desatualizada. Prefira o botão Imprimir, que confere as inscrições antes de imprimir.'
        : '');
    };
    window.addEventListener('beforeprint', verificar);
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
    mq?.addEventListener?.('change', e => { if (e.matches) verificar(); });
    return () => {
      window.removeEventListener('beforeprint', verificar);
      mq?.removeEventListener?.('change', () => {});
    };
  }, [verificadoEm]);
  async function imprimir() {
    setConferindo(true); setAviso('');
    try {
      if (!onBeforePrint || !await onBeforePrint()) { setAviso('A lista foi atualizada. Confira as cartas e toque em Imprimir novamente.'); return; }
      // A marca deve estar carregada antes de abrir o diálogo de impressão.
      const marca = new Image(); marca.src = MARCA_CARTINHAS;
      await Promise.race([
        marca.decode(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('marca_indisponivel')), 10000)),
      ]);
      window.print();
    } catch (error) { setAviso(error?.code === 'rascunhos_nao_sincronizados' ? error.message : 'Não foi possível conferir as inscrições agora. A impressão não foi iniciada.'); }
    finally { setConferindo(false); }
  }
  const [orientacao, setOrientacao] = useState("retrato"); // retrato | paisagem
  const [colunas, setColunas] = useState(2);
  const [vinho, setVinho] = useState(true);

  const dados = useMemo(
    () => cartinhas.map(normalizarCartinhaImpressao).filter((c) => c.nome && c.paragrafos.length),
    [cartinhas]
  );

  const pageW = orientacao === "paisagem" ? 297 : 210;
  const pageH = orientacao === "paisagem" ? 210 : 297;
  const contentWmm = pageW - 2 * MARGIN_MM;
  const contentHmm = pageH - 2 * MARGIN_MM;
  const colWmm = (contentWmm - GAP_MM * (colunas - 1)) / colunas;
  const colWpx = colWmm * PX_PER_MM;
  const contentHpx = contentHmm * PX_PER_MM;

  // --- medição de altura de cada cartinha na largura real da coluna ---
  const measureRef = useRef(null);
  const [heights, setHeights] = useState(null);
  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const hs = Array.from(measureRef.current.children).map(
      (n) => n.getBoundingClientRect().height
    );
    setHeights(hs);
  }, [dados, colWpx, vinho]);

  // --- empacota cartinhas em páginas (colunas de altura <= página) ---
  const pages = useMemo(() => {
    if (!heights) return null;
    const gapPx = CARD_GAP_MM * PX_PER_MM;
    const pgs = [];
    let page = [], col = [], colH = 0, colCount = 0;
    const closeCol = () => {
      page.push(col);
      col = []; colH = 0; colCount += 1;
      if (colCount === colunas) { pgs.push(page); page = []; colCount = 0; }
    };
    dados.forEach((c, i) => {
      const cardH = heights[i] || 0;
      const add = (col.length ? gapPx : 0) + cardH;
      if (col.length && colH + add > contentHpx) closeCol();
      colH += (col.length ? gapPx : 0) + cardH;
      col.push(i);
    });
    if (col.length) closeCol();
    if (page.length) { while (page.length < colunas) page.push([]); pgs.push(page); }
    return pgs;
  }, [heights, dados, colunas, contentHpx]);

  // Estimativa de cartinhas por folha (média)
  const porFolha = useMemo(() => {
    if (!pages || !pages.length) return null;
    return Math.round(dados.length / pages.length);
  }, [pages, dados.length]);

  // --- escala a página p/ caber na largura da tela (não afeta impressão) ---
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const calc = () =>
      setScale(Math.min(1, el.clientWidth / (pageW * PX_PER_MM)));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageW]);

  const pageWpx = pageW * PX_PER_MM;
  const pageHpx = pageH * PX_PER_MM;

  return (
    <div className="m31cp-root">
      <style>{cssFor(orientacao)}</style>

      <div className="m31cp-bar no-print">
        <div className="m31cp-bar-info">
          <strong>{dados.length}</strong> {escopo === 'voluntarias' ? 'cartinhas da equipe' : 'cartinhas de inscritas'} · {pages ? pages.length : "…"} pág
          {porFolha != null && <> · ~<strong>{porFolha}</strong>/folha</>}
        </div>
        <div className="m31cp-bar-ctrls">
          <div className="m31cp-seg">
            <button className={orientacao === "retrato" ? "on" : ""} onClick={() => setOrientacao("retrato")}>Retrato</button>
            <button className={orientacao === "paisagem" ? "on" : ""} onClick={() => setOrientacao("paisagem")}>Paisagem</button>
          </div>
          <div className="m31cp-seg">
            {[2, 3].map((n) => (
              <button key={n} className={colunas === n ? "on" : ""} onClick={() => setColunas(n)}>{n} col</button>
            ))}
          </div>
          <label className="m31cp-toggle">
            <input type="checkbox" checked={vinho} onChange={(e) => setVinho(e.target.checked)} /> Nome em vinho
          </label>
          <button className="m31cp-print" disabled={conferindo || !dados.length} onClick={imprimir}>{conferindo ? 'Conferindo…' : 'Imprimir'}</button>
        </div>
      </div>

      {aviso && <p role="alert" className="no-print px-4 py-3 text-center text-rose-900">{aviso}</p>}
      {avisoImpressao && <p role="alert" className="m31cp-aviso">⚠ {avisoImpressao}</p>}
      {dados.length === 0 && (
        <div className="m31cp-loading no-print">Nenhuma cartinha pronta para imprimir.</div>
      )}

      {/* medidor invisível: renderiza cada cartinha na largura da coluna */}
      <div className="m31cp-measure" ref={measureRef} style={{ width: colWpx }} aria-hidden>
        {dados.map((c, i) => <CartinhaImpressa c={c} key={i} />)}
      </div>

      {/* palco paginado */}
      <div className="m31cp-stage" ref={stageRef} data-vinho={vinho ? "true" : "false"}>
        {dados.length > 0 && !pages && <div className="m31cp-loading">montando páginas…</div>}
        {pages && pages.map((page, pi) => (
          <div
            className="m31cp-pagewrap"
            key={pi}
            style={{ height: pageHpx * scale, width: pageWpx * scale }}
          >
            <div
              className="m31cp-page"
              style={{
                width: pageWpx, height: pageHpx,
                padding: MARGIN_MM * PX_PER_MM, gap: GAP_MM * PX_PER_MM,
                transform: `scale(${scale})`,
              }}
            >
              {page.map((colIdxs, ci) => (
                <div className="m31cp-col" key={ci} style={{ gap: CARD_GAP_MM * PX_PER_MM }}>
                  {colIdxs.map((idx) => <CartinhaImpressa c={dados[idx]} key={idx} />)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function cssFor(orientacao) {
  const page = orientacao === "paisagem" ? "A4 landscape" : "A4 portrait";
  return `
.m31cp-root { --vinho:#8B1A2B; --tinta:#1a1614; --linha:#c9c4bc;
  background:#e9e6e0; min-height:100vh; padding:0 0 40px;
  font-family:Georgia,'Times New Roman',serif; color:var(--tinta); }

.m31cp-bar { position:sticky; top:0; z-index:5; display:flex; align-items:center;
  justify-content:space-between; gap:16px; flex-wrap:wrap;
  padding:12px 20px; background:#fff; border-bottom:1px solid #e6e2db;
  font-family:system-ui,-apple-system,sans-serif; }
.m31cp-bar-info { font-size:13px; color:#555; }
.m31cp-bar-info strong { color:var(--tinta); font-size:15px; }
.m31cp-bar-ctrls { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.m31cp-seg { display:inline-flex; border:1px solid #d8d3ca; border-radius:8px; overflow:hidden; }
.m31cp-seg button { border:0; background:#fff; padding:7px 12px; font-size:13px; cursor:pointer; color:#555; }
.m31cp-seg button.on { background:var(--tinta); color:#fff; }
.m31cp-toggle { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:#555; cursor:pointer; }
.m31cp-print { border:0; background:var(--vinho); color:#fff; padding:8px 18px;
  border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; }

.m31cp-measure { position:absolute; left:-99999px; top:0; visibility:hidden; }

.m31cp-aviso { margin:10px 20px 0; padding:10px 14px; border:1.5px solid #b91c1c; border-radius:8px;
  color:#7f1d1d; background:#fff5f5; font-family:system-ui,-apple-system,sans-serif; font-size:13px; }

.m31cp-stage { padding:20px 12px; }
.m31cp-loading { text-align:center; color:#888; font-family:system-ui,sans-serif; padding:40px; }
.m31cp-pagewrap { margin:0 auto 18px; }
.m31cp-page { box-sizing:border-box; background:#fff; display:flex;
  transform-origin:top left; box-shadow:0 2px 18px rgba(0,0,0,.12); }
.m31cp-col { flex:1 1 0; display:flex; flex-direction:column; min-width:0; }

.m31cp-cartinha { position:relative; isolation:isolate; box-sizing:border-box; break-inside:avoid;
  border:1px dashed var(--linha); border-radius:2px; padding:4mm 4mm 3mm; }
.m31cp-marca { position:absolute; width:45%; max-height:78%; object-fit:contain;
  left:50%; top:50%; transform:translate(-50%,-50%); opacity:.055; filter:grayscale(1) brightness(0);
  pointer-events:none; z-index:0; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
.m31cp-conteudo { position:relative; z-index:1; }
.m31cp-identificacao { display:flex; flex-direction:column; align-items:flex-end;
  text-align:right; font-family:system-ui,-apple-system,sans-serif; font-size:7pt;
  line-height:1.3; color:#555; margin:3mm 0 0; overflow-wrap:anywhere; }
.m31cp-nome { font-family:system-ui,-apple-system,sans-serif; font-size:11pt; font-weight:700;
  letter-spacing:.2px; padding-bottom:1.5mm; margin-bottom:2.5mm; border-bottom:1px solid #ece8e1; }
.m31cp-stage[data-vinho="true"] .m31cp-nome { color:var(--vinho); border-bottom-color:#e7cdd2; }
.m31cp-p { font-size:9pt; line-height:1.3; margin:0 0 3pt; text-align:justify; hyphens:auto; white-space:pre-line; }
.m31cp-sig { font-size:10pt; font-style:italic; margin:1.5mm 0 0; }

@page { size:${page}; margin:0; }
@media print {
  .no-print, .m31cp-measure, .m31cp-loading { display:none !important; }
  .m31cp-root { background:#fff !important; padding:0; }
  .m31cp-stage { padding:0; }
  .m31cp-pagewrap { margin:0 !important; width:auto !important; height:auto !important; }
  .m31cp-page { transform:none !important; box-shadow:none !important;
    width:${orientacao === "paisagem" ? "297mm" : "210mm"} !important;
    height:${orientacao === "paisagem" ? "210mm" : "297mm"} !important;
    padding:8mm !important; gap:5mm !important; break-after:page; }
  .m31cp-pagewrap:last-child .m31cp-page { break-after:auto; }
  .m31cp-col { gap:4mm !important; }
  .m31cp-cartinha { border-color:#cfcfcf; }
}
`;
}