import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

// Mesma marca da landing e do ingresso, sem a faixa de data da marca antiga.
const LOGO = '/assets/a22f06b49_LOGOM31FILHAS1.png';
const BG = '#100D0E';
const MOTIVO_MSG = {
  nao_encontrado: 'Este link não é válido. Peça à organização o link da sua inscrição.',
  nao_pago: 'A confirmação desta inscrição ainda está pendente. Fale com a organização.',
};

function maskPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  const d = digits.startsWith('55') && digits.length === 13 ? digits.slice(2) : digits;
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function isValidPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return /^[1-9]\d9\d{8}$/.test(digits);
}

function isPendingName(nome) {
  return /^abençoada por .+\s[—–-]\s*cadastro pendente$/i.test(String(nome || '').trim());
}

const pageCss = `
  .m31-gift { box-sizing: border-box; min-height: 100vh; min-height: 100svh; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); background: radial-gradient(ellipse at 50% 0, #30161e 0, #100d0e 60%); color: #f5f5f0; font-family: system-ui, -apple-system, sans-serif; }
  .m31-gift *, .m31-gift *::before, .m31-gift *::after { box-sizing: border-box; }
  .m31-gift__content { width: 100%; max-width: 440px; margin: 0 auto; }
  .m31-gift__brand { position: relative; width: 156px; height: 112px; margin: 0 auto 12px; overflow: hidden; }
  .m31-gift__brand img { position: absolute; width: 208px; height: 260px; max-width: none; left: 50%; top: 50%; transform: translate(-50%, -50%); object-fit: contain; }
  .m31-gift__brand-text { display: grid; place-items: center; height: 100%; font-size: 22px; font-weight: 700; letter-spacing: .08em; }
  .m31-gift h1 { font-size: clamp(26px, 6.5vw, 30px); line-height: 1.18; letter-spacing: -.025em; margin: 0 0 12px; font-weight: 750; text-wrap: balance; }
  .m31-gift p { margin: 0; }
  .m31-gift__intro, .m31-gift__state { text-align: center; }
  .m31-gift__donor { color: #d7ccd0; font-size: 16px; line-height: 1.5; overflow-wrap: anywhere; }
  .m31-gift__donor strong { color: #f5f5f0; font-weight: 600; }
  .m31-gift__paid { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 16px !important; color: #b6f0c8; font-size: 14px; line-height: 1.5; }
  .m31-gift__check { display: inline-grid; place-items: center; width: 20px; height: 20px; flex-shrink: 0; border: 1px solid #537760; border-radius: 50%; font-size: 12px; }
  .m31-gift__form { margin-top: 24px; padding-top: 22px; border-top: 1px solid #3b2b31; }
  .m31-gift__instruction { color: #d7ccd0; font-size: 15px; line-height: 1.5; margin-bottom: 20px !important; }
  .m31-gift__field { margin-bottom: 18px; }
  .m31-gift label { display: block; margin-bottom: 8px; color: #f5f5f0; font-size: 15px; font-weight: 600; }
  .m31-gift input { width: 100%; min-height: 54px; padding: 13px 14px; background: #241c20; border: 1px solid #806773; border-radius: 12px; color: #f5f5f0; font-size: 16px; line-height: 1.5; }
  .m31-gift input::placeholder { color: #b6a8af; opacity: 1; }
  .m31-gift input:focus-visible, .m31-gift button:focus-visible, .m31-gift a:focus-visible { outline: 3px solid #f2a9ba; outline-offset: 3px; }
  .m31-gift__hint { font-size: 13px; line-height: 1.5; color: #bfb1b8; margin-top: 8px !important; }
  .m31-gift__button { display: block; width: 100%; min-height: 54px; padding: 14px 18px; border: 1px solid #a5455a; border-radius: 12px; background: #8b1a2b; color: #fff; font-size: 16px; line-height: 1.4; font-weight: 650; cursor: pointer; margin-top: 24px; transition: background .15s; }
  .m31-gift__button:hover { background: #a3243b; }
  .m31-gift__button:disabled { opacity: .7; cursor: wait; }
  .m31-gift__error { margin-top: 16px; padding: 14px; border-left: 3px solid #f2a9ba; border-radius: 4px; background: #351b23; color: #ffd5df; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
  .m31-gift__error:focus { outline: 2px solid #f2a9ba; outline-offset: 3px; }
  .m31-gift__state { padding-top: 12px; }
  .m31-gift__state p { font-size: 16px; line-height: 1.6; color: #d7ccd0; }
  .m31-gift__qr { margin: 24px auto 0; }
  .m31-gift__qr img { display: block; width: 216px; height: 216px; max-width: 100%; margin: 12px auto 0; padding: 8px; background: #fff; border-radius: 12px; object-fit: contain; }
  .m31-gift__footer { text-align: center; font-size: 12px; color: #bfb1b8; margin-top: 26px !important; line-height: 1.5; }
  .m31-gift__spinner { width: 28px; height: 28px; border: 3px solid #65515a; border-top-color: #f2a9ba; border-radius: 50%; margin: 12px auto; animation: m31-gift-spin 1s linear infinite; }
  @keyframes m31-gift-spin { to { transform: rotate(360deg); } }
  @media (min-width: 600px) { .m31-gift { padding-top: 40px; padding-bottom: 40px; } }
  @media (prefers-reduced-motion: reduce) { .m31-gift__spinner { animation: none; } .m31-gift__button { transition: none; } }
`;

function GiftBrand() {
  const [failed, setFailed] = useState(false);
  return (
    <div className="m31-gift__brand">
      {failed
        ? <span className="m31-gift__brand-text">M31 FILHAS</span>
        : <img src={LOGO} width="208" height="260" alt="M31 Filhas" onError={() => setFailed(true)} />}
    </div>
  );
}

export default function M31CompletarCadastro() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({ nome: '', whatsapp: '' });
  const [submitting, setSubmitting] = useState(false);
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const [qrUrl, setQrUrl] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const errorRef = useRef(null);
  const successRef = useRef(null);

  useEffect(() => {
    const previousBackground = document.body.style.backgroundColor;
    document.body.style.backgroundColor = BG;
    return () => { document.body.style.backgroundColor = previousBackground; };
  }, []);

  useEffect(() => { if (erro) errorRef.current?.focus(); }, [erro]);
  useEffect(() => { if (sucesso) successRef.current?.focus(); }, [sucesso]);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setLoadError(false);
    setSucesso(false);
    setQrUrl(null);
    setErro(null);
    (async () => {
      try {
        const res = await base44.functions.invoke('m31ConsultarCadastroConvidada', { token });
        if (!ativo) return;
        setInfo(res.data);
        if (res.data?.valido && !res.data?.ja_concluido) {
          setForm((f) => ({
            ...f,
            nome: isPendingName(res.data.nome) ? '' : (res.data.nome || ''),
            whatsapp: maskPhone(res.data.whatsapp || ''),
          }));
        }
        if (res.data?.valido && res.data?.ja_concluido) {
          setSucesso(true);
          setQrUrl(res.data.qrcode_url || null);
        }
      } catch {
        if (ativo) setLoadError(true);
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [token, loadAttempt]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    if (!form.nome.trim() || isPendingName(form.nome)) { setErro('Informe seu nome completo.'); return; }
    if (!isValidPhone(form.whatsapp)) { setErro('Confira seu WhatsApp: informe o DDD e os nove dígitos do celular.'); return; }
    setSubmitting(true);
    try {
      const res = await base44.functions.invoke('m31ConcluirCadastroConvidada', {
        token, nome: form.nome.trim(), whatsapp: form.whatsapp,
      });
      if (res.data?.success) {
        setQrUrl(res.data.qrcode_url || null);
        setSucesso(true);
      } else {
        setErro(res.data?.error || 'Não foi possível salvar. Seus dados continuam aqui para tentar novamente.');
      }
    } catch (err) {
      setErro(err?.response?.data?.error || 'Não foi possível salvar. Confira sua conexão e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="m31-gift" lang="pt-BR">
      <style>{pageCss}</style>
      <div className="m31-gift__content">
        <GiftBrand />
        {loading ? (
          <div className="m31-gift__state" role="status">
            <div className="m31-gift__spinner" aria-hidden="true" />
            <p>Carregando sua inscrição…</p>
          </div>
        ) : loadError ? (
          <section className="m31-gift__state" aria-labelledby="gift-load-title">
            <h1 id="gift-load-title">Não foi possível carregar</h1>
            <p>Confira sua conexão e tente novamente.</p>
            <button className="m31-gift__button" type="button" onClick={() => setLoadAttempt(loadAttempt + 1)}>Tentar novamente</button>
          </section>
        ) : sucesso ? (
          <section className="m31-gift__state" aria-labelledby="gift-success-title">
            <h1 id="gift-success-title" ref={successRef} tabIndex={-1}>Seus dados foram salvos!</h1>
            <p>Está tudo certo com o seu cadastro. Acompanhe pelo WhatsApp as informações do seu ingresso.</p>
            {qrUrl && (
              <div className="m31-gift__qr">
                <p>Seu QR Code de entrada</p>
                <img src={qrUrl} alt="QR Code de entrada" width="216" height="216" />
              </div>
            )}
          </section>
        ) : !info?.valido ? (
          <section className="m31-gift__state" aria-labelledby="gift-invalid-title">
            <h1 id="gift-invalid-title">Link indisponível</h1>
            <p>{MOTIVO_MSG[info?.motivo_invalido] || 'Peça à organização o link da sua inscrição.'}</p>
          </section>
        ) : (
          <>
            <header className="m31-gift__intro">
              <h1>Você foi abençoada!</h1>
              <p className="m31-gift__donor">
                {info.pagador_nome
                  ? <><strong>{info.pagador_nome}</strong> presenteou você com uma inscrição.</>
                  : <>Você recebeu uma inscrição para o M31 Filhas.</>}
              </p>
              <p className="m31-gift__paid"><span className="m31-gift__check" aria-hidden="true">✓</span>Sua inscrição já está paga.</p>
            </header>
            <form className="m31-gift__form" onSubmit={handleSubmit} aria-busy={submitting} aria-describedby="gift-instruction">
              <p id="gift-instruction" className="m31-gift__instruction">Para concluir, confirme seu nome e WhatsApp.</p>
              <div className="m31-gift__field">
                <label htmlFor="gift-name">Seu nome completo</label>
                <input id="gift-name" name="nome" required autoComplete="name" value={form.nome}
                  onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Digite seu nome completo" />
              </div>
              <div className="m31-gift__field">
                <label htmlFor="gift-phone">Seu WhatsApp com DDD</label>
                <input id="gift-phone" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel-national" required
                  value={form.whatsapp} aria-describedby="gift-phone-hint"
                  onChange={e => setForm({ ...form, whatsapp: maskPhone(e.target.value) })} placeholder="(81) 99999-9999" />
                <p id="gift-phone-hint" className="m31-gift__hint">Use o seu número, diferente do de quem presenteou você. Ele será usado para as informações do ingresso.</p>
              </div>
              {erro && <div ref={errorRef} className="m31-gift__error" role="alert" tabIndex={-1}>{erro}</div>}
              <button className="m31-gift__button" type="submit" disabled={submitting}>
                {submitting ? 'Salvando seus dados…' : 'Confirmar meus dados'}
              </button>
              {submitting && <p className="m31-gift__hint" role="status">Aguarde enquanto salvamos seu cadastro.</p>}
            </form>
          </>
        )}
        <p className="m31-gift__footer">M31 Filhas · Edição 2026</p>
      </div>
    </main>
  );
}
