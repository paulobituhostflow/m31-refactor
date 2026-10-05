// M31 Caravana — Inscrição Individual · Design System Unificado
import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import { M31GlobalStyles } from '@/lib/m31Design.jsx';
import { themeVars } from '@/lib/m31VisualTheme';
import { M31Logo } from '@/components/M31Logo';
import IdentityBanner from '@/components/m31/forms/IdentityBanner';
import InscricaoRecuperadaBanner from '@/components/m31/forms/InscricaoRecuperadaBanner';
import { usePublicFormConfig } from '@/hooks/usePublicFormConfig';
import ExtrasFields from '@/components/m31/forms/ExtrasFields';
import { serializarExtras } from '@/components/m31/builder/publicFormsCatalog';

function maskPhone(raw) {
  const d = raw.replace(/\D/g,'').slice(0,11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3,7)}-${d.slice(7)}`;
}
function maskCPF(raw) {
  const d = raw.replace(/\D/g,'').slice(0,11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function Field({ label, required, value, onChange, type = 'text', inputMode, fieldId, errorText }) {
  const [active, setActive] = useState(false);
  return (
    <div id={fieldId} className={`m31-ds-field${active ? ' active' : ''}${value ? ' filled' : ''}${errorText ? ' is-error' : ''}`}>
      <span className="m31-ds-label">{label}{required && <span className="req">*</span>}</span>
      <input className="m31-ds-input" type={type} inputMode={inputMode} value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setActive(true)} onBlur={() => setActive(false)} />
      {errorText && <div style={{ marginTop:6, fontSize:12, color:'#B42318' }}>{errorText}</div>}
    </div>
  );
}

function SelectField({ label, required, value, onChange, options, disabled, fieldId, errorText }) {
  const [active, setActive] = useState(false);
  return (
    <div id={fieldId} className={`m31-ds-field${active ? ' active' : ''}${value ? ' filled' : ''}${errorText ? ' is-error' : ''}`}>
      <span className="m31-ds-label">{label}{required && <span className="req">*</span>}</span>
      <div className="m31-ds-select-wrap">
        <select className="m31-ds-select" value={value} onChange={e => onChange(e.target.value)}
          onFocus={() => setActive(true)} onBlur={() => setActive(false)} disabled={disabled}>
          <option value=""> </option>
          {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
        </select>
      </div>
      {errorText && <div style={{ marginTop:6, fontSize:12, color:'#B42318' }}>{errorText}</div>}
    </div>
  );
}

const VALOR = 97;

export default function M31CaravanaForm({ caravanaId }) {
  // FORÇA BRUTA: Light mode no DOM
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const hadDark = html.classList.contains('dark');
    const prevDataTheme = html.getAttribute('data-theme');

    html.classList.remove('dark');
    html.classList.add('light');
    html.setAttribute('data-theme', 'light');
    body.classList.remove('dark');
    body.classList.add('light');
    body.style.backgroundColor = '#FFFFFF';
    body.style.color = '#1A1A1A';

    return () => {
      if (hadDark) {
        html.classList.add('dark');
        html.classList.remove('light');
        body.classList.add('dark');
        body.classList.remove('light');
      }
      if (prevDataTheme) {
        html.setAttribute('data-theme', prevDataTheme);
      } else {
        html.removeAttribute('data-theme');
      }
      body.style.backgroundColor = '';
      body.style.color = '';
    };
  }, []);

  const urlParams = new URLSearchParams(window.location.search);
  const fixedCaravanaId = caravanaId || urlParams.get('caravana_id') || null;
  const retomadaToken = urlParams.get('retomar') || null;

  const [form, setForm] = useState({
    nome:'', email:'', celular:'', cpf:'', nascimento:'',
    caravana_id: fixedCaravanaId || '', comoConheceu:''
  });
  const [caravanas, setCaravanas] = useState([]);
  const [loadingCaravanas, setLoadingCaravanas] = useState(true);
  const [caravanaLoadError, setCaravanaLoadError] = useState('');
  const [intencaoId, setIntencaoId] = useState(null);
  const [inscricaoRecuperada, setInscricaoRecuperada] = useState(null);
  const [loadingRetomada, setLoadingRetomada] = useState(false);
  const capturaRef = useRef('');
  const [loteValor, setLoteValor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const [payUrl, setPayUrl] = useState('');
  // Builder 360: configuração editável (banner, textos, campos) — defaults garantidos.
  const { T, campo, extras, config } = usePublicFormConfig('caravana');
  const [valoresExtras, setValoresExtras] = useState({});

  async function carregarCaravanas() {
    setLoadingCaravanas(true);
    setCaravanaLoadError('');
    try {
      const res = await base44.functions.invoke('m31-caravana-flow', { action: 'catalogo' });
      const data = res?.data?.caravanas || res?.caravanas || [];
      setCaravanas(data);
      if (!data.length) setCaravanaLoadError('Nenhuma caravana está disponível no momento.');
    } catch (e) {
      setCaravanas([]);
      setCaravanaLoadError('Não foi possível carregar as caravanas. Tente novamente.');
    } finally {
      setLoadingCaravanas(false);
    }
  }

  useEffect(() => { carregarCaravanas(); }, []);

  useEffect(() => {
    if (!retomadaToken) return;
    let cancelled = false;
    setLoadingRetomada(true);
    base44.functions.invoke('m31-caravana-flow', { action: 'retomar', token: retomadaToken })
      .then((res) => {
        if (cancelled) return;
        const i = res?.data?.inscricao || res?.inscricao;
        if (!i) return;
        setInscricaoRecuperada(i);
        setIntencaoId(i.id || null);
        setForm((f) => ({
          ...f,
          nome: i.nome || f.nome,
          email: i.email || f.email,
          celular: i.whatsapp ? maskPhone(String(i.whatsapp).replace(/^55/, '')) : f.celular,
          cpf: i.cpf ? maskCPF(i.cpf) : f.cpf,
          caravana_id: i.caravana_id || f.caravana_id,
          comoConheceu: i.como_conheceu || f.comoConheceu,
        }));
        if (i.ja_aprovado) setError('Sua inscrição já está confirmada. Não é necessário gerar novo pagamento.');
      })
      .catch(() => {
        if (!cancelled) setError('Não foi possível recuperar seus dados automaticamente. Preencha o formulário ou fale com o suporte.');
      })
      .finally(() => { if (!cancelled) setLoadingRetomada(false); });
    return () => { cancelled = true; };
  }, [retomadaToken]);

  useEffect(() => {
    base44.entities.EventoM31Lote.filter({ ativo: true }, null, 5)
      .then(lotes => {
        const lote = (lotes || []).find(l => l.ativo) || null;
        setLoteValor(lote?.valor ?? null);
      })
      .catch(() => setLoteValor(null));
  }, []);

  const set = field => val => setForm(f => ({ ...f, [field]: val }));
  const caravanaOptions = caravanas.map(c => ({ value: c.id, label: c.nome }));
  const caravanaSelecionada = caravanas.find(c => c.id === form.caravana_id);

  // Captura a intenção ANTES do pagamento, quando os dados essenciais já estão completos.
  // Assim, qualquer falha do Asaas fica vinculada a uma pessoa recuperável, sem criar lead parcial demais cedo.
  useEffect(() => {
    const nomeOk = form.nome.trim().length >= 3;
    const tel = form.celular.replace(/\D/g, '');
    if (!nomeOk || tel.length < 10 || !form.caravana_id) return;

    const cpf = form.cpf.replace(/\D/g, '');
    const email = form.email.trim().toLowerCase();
    const chave = `${form.nome.trim()}|${tel}|${form.caravana_id}`;
    if (capturaRef.current === chave) return;
    const timer = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('m31-caravana-flow', {
          action: 'capturar_intencao',
          nome: form.nome.trim(),
          whatsapp: '55' + tel,
          email: email || undefined,
          cpf: cpf || undefined,
          caravana_id: form.caravana_id,
          inscricao_id: intencaoId || undefined,
        });
        const id = res?.data?.inscricao_id || res?.inscricao_id;
        if (id) setIntencaoId(id);
        capturaRef.current = chave;
      } catch (_) {
        // A captura antecipada não bloqueia a pessoa; o submit fará nova tentativa.
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [form.nome, form.celular, form.caravana_id, intencaoId]);

  const { cidadeInferida, estadoInferido } = (() => {
    if (!caravanaSelecionada?.cidade_origem) return { cidadeInferida:'', estadoInferido:'' };
    const raw = caravanaSelecionada.cidade_origem.trim();
    const match = raw.match(/^(.+?)\s*[-,]\s*([A-Z]{2})$/);
    if (match) return { cidadeInferida: match[1].trim(), estadoInferido: match[2].trim() };
    return { cidadeInferida: raw, estadoInferido:'' };
  })();

  function validate() {
    const errors = {};
    if (!form.nome.trim() || form.nome.trim().split(/\s+/).length < 2) errors.nome = 'Informe seu nome completo.';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Informe um e-mail válido.';
    if (form.celular.replace(/\D/g,'').length < 10) errors.celular = 'Informe um WhatsApp com DDD.';
    if (form.cpf.replace(/\D/g,'').length !== 11) errors.cpf = 'CPF deve ter 11 dígitos.';
    if (campo('nascimento').visivel && campo('nascimento').obrigatorio && !form.nascimento) errors.nascimento = 'Informe sua data de nascimento.';
    if (campo('caravana').visivel && !fixedCaravanaId && !form.caravana_id) errors.caravana_id = 'Selecione sua caravana.';
    if (campo('comoConheceu').visivel && campo('comoConheceu').obrigatorio && !form.comoConheceu) errors.comoConheceu = 'Responda como conheceu o M31.';
    for (const f of extras) {
      const v = String(valoresExtras[f.id] ?? '').trim();
      if (f.required && !v) errors[`extra:${f.id}`] = `Preencha o campo "${f.label}".`;
    }
    return errors;
  }

  async function handleSubmit() {
    const errors = validate();
    const firstKey = Object.keys(errors)[0];
    if (firstKey) {
      setFieldErrors(errors);
      setError(errors[firstKey]);
      requestAnimationFrame(() => {
        const el = document.getElementById(`field-${firstKey.replace(':', '-')}`);
        el?.scrollIntoView({ behavior:'smooth', block:'center' });
      });
      return;
    }
    setFieldErrors({});
    setError(''); setLoading(true);
    try {
      const res = await base44.functions.invoke('m31-caravana-flow', {
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        whatsapp: '55' + form.celular.replace(/\D/g,''),
        cpf: form.cpf.replace(/\D/g,''), nascimento: form.nascimento,
        cidade: cidadeInferida, estado: estadoInferido,
        caravana_id: form.caravana_id,
        qtd_pessoas: 1,
        como_conheceu: form.comoConheceu || undefined,
        inscricao_id: intencaoId || undefined,
        // Campos personalizados → observações do registro (payload oficial intocado).
        observacoes: serializarExtras(extras, valoresExtras) || undefined,
      });
      if (res.data?.payment_url) setPayUrl(res.data.payment_url);
      setSuccess(true);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.data?.error || e?.message;
      setError(msg || 'Erro ao processar. Seus dados foram preservados. Tente novamente ou fale com o suporte.');
    } finally { setLoading(false); }
  }

  const toggleCls = f => !form[f] && error ? ' is-error' : form[f] ? ' is-valid' : '';

  // Calcular progresso
  const camposObrigatorios = [
    'nome', 'email', 'celular', 'cpf',
    ...(campo('nascimento').visivel && campo('nascimento').obrigatorio ? ['nascimento'] : []),
    ...(fixedCaravanaId || !campo('caravana').visivel ? [] : ['caravana_id']),
    ...(campo('comoConheceu').visivel && campo('comoConheceu').obrigatorio ? ['comoConheceu'] : []),
    ...extras.filter(f => f.required).map(f => `extra:${f.id}`),
  ];
  const valorCampoObrigatorio = (f) => f.startsWith('extra:')
    ? String(valoresExtras[f.slice(6)] ?? '').trim()
    : (form[f] && form[f].toString().trim());
  const camposPreenchidos = camposObrigatorios.filter(valorCampoObrigatorio).length;
  const percentualProgresso = Math.round((camposPreenchidos / camposObrigatorios.length) * 100);
  const camposFaltando = camposObrigatorios.length - camposPreenchidos;

  return (
    <div className="m31-ds-page" style={themeVars(config.cores)}>
      <M31GlobalStyles />
      <div className="m31-ds-wrapper" style={{ padding: '24px 20px 48px' }}>

        {/* Header */}
        <motion.div className="m31-ds-header" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45 }}>
          <div style={{ width:'180px', maxWidth:'65%', display:'block', margin:'0 auto 20px' }}>
            <M31Logo size="lg" />
          </div>
          <div className="m31-ds-badge">
            <svg viewBox="0 0 24 24" style={{width:11,height:11,stroke:'currentColor',strokeWidth:2,fill:'none'}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            {T('badge')}
          </div>
          <div className="m31-ds-title">{T('title_a')} <em>{T('title_em')}</em></div>
          <div className="m31-ds-subtitle">{T('sub')}</div>
        </motion.div>

        {/* Banner de identidade — topo, uniforme em todos os formulários públicos */}
        <IdentityBanner />

        {/* Banner editável (opcional) */}
        {config.banner?.url && (
          <img src={config.banner.url} alt={config.banner.alt || ''} style={{ width: '100%', borderRadius: 16, marginBottom: 16, display: 'block' }} />
        )}

        {/* Meta strip */}
        <div className="m31-ds-meta">
          <div className="m31-ds-meta-cell">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {T('meta_data')}
          </div>
          <div className="m31-ds-meta-cell">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {T('meta_hora')}
          </div>
          <div className="m31-ds-meta-cell">
            <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {T('meta_local')}
          </div>
        </div>

        {/* Rótulo do formulário */}
        <div style={{ textAlign:'center', marginBottom:'16px' }}>
          <span style={{ fontSize:13, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--m31-brand)' }}>
            {T('rotulo')}
          </span>
        </div>

        {/* Form card */}
        <motion.div className="m31-ds-card" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45, delay:0.12 }}>
          <div className="m31-ds-card-header">
            <div className="m31-ds-card-icon">
              <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
            </div>
            <div className="m31-ds-card-header-text">
              <div className="m31-ds-card-label">{T('card_label')}</div>
              <div className="m31-ds-card-title">{T('card_title')}</div>
            </div>
            <div className="m31-ds-price">
              <div className="m31-ds-price-value"><span className="currency">R$</span>97</div>
              <div className="m31-ds-price-sub">{T('price_sub')}</div>
            </div>
          </div>

          <div className="m31-ds-body">
            <AnimatePresence mode="wait">
              {!success ? (
                <motion.div key="form" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}>

                  {/* Caravana */}
                  {!fixedCaravanaId && (
                    <>
                      <div className="m31-ds-section">{T('sec_caravana')}</div>
                      {loadingCaravanas ? (
                        <div style={{ padding:'12px 14px', fontSize:13, color:'var(--m31-t3)', background:'var(--m31-input)', borderRadius:12, textAlign:'center' }}>
                          {T('caravanas_carregando')}
                        </div>
                      ) : caravanas.length === 0 ? (
                        <div className="m31-ds-info-box gold" style={{ alignItems:'center' }}>
                          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          <span style={{ flex:1 }}>{caravanaLoadError || T('caravanas_vazio')}</span>
                          {caravanaLoadError && (
                            <button type="button" onClick={carregarCaravanas}
                              style={{ border:'1px solid var(--m31-border)', borderRadius:10, padding:'8px 10px', background:'#fff', fontWeight:700, cursor:'pointer' }}>
                              Tentar novamente
                            </button>
                          )}
                        </div>
                      ) : (
                        <SelectField fieldId="field-caravana_id" errorText={fieldErrors.caravana_id} label={campo('caravana').label} required value={form.caravana_id} onChange={set('caravana_id')} options={caravanaOptions} />
                      )}
                    </>
                  )}

                  {fixedCaravanaId && caravanaSelecionada && (
                    <div className="m31-ds-info-box" style={{ marginBottom:8 }}>
                      <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      <span>Você está se inscrevendo na caravana <strong>{caravanaSelecionada.nome}</strong>.</span>
                    </div>
                  )}

                  <div className="m31-ds-section">{T('sec_dados')}</div>
                  <InscricaoRecuperadaBanner inscricao={inscricaoRecuperada} />
                  <Field fieldId="field-nome" errorText={fieldErrors.nome} label={campo('nome').label} required value={form.nome} onChange={set('nome')} />
                  <Field fieldId="field-celular" errorText={fieldErrors.celular} label={campo('celular').label} required value={form.celular} onChange={v => set('celular')(maskPhone(v))} type="tel" />
                  <Field fieldId="field-email" errorText={fieldErrors.email} label={campo('email').label} required value={form.email} onChange={set('email')} type="email" />
                  <Field fieldId="field-cpf" errorText={fieldErrors.cpf} label={campo('cpf').label} required value={form.cpf} onChange={v => set('cpf')(maskCPF(v))} inputMode="numeric" />
                  {campo('nascimento').visivel && <Field fieldId="field-nascimento" errorText={fieldErrors.nascimento} label={campo('nascimento').label} required={campo('nascimento').obrigatorio} value={form.nascimento} onChange={set('nascimento')} type="date" />}

                  <div className="m31-ds-section">{T('sec_sobre')}</div>

                  {/* Como conheceu? */}
                  {campo('comoConheceu').visivel && (
                  <div id="field-comoConheceu" className={`m31-ds-toggle-card${toggleCls('comoConheceu')}${fieldErrors.comoConheceu ? ' is-error' : ''}`}> 
                    <div className="m31-ds-toggle-q">Como conheceu o M31?{campo('comoConheceu').obrigatorio && <span style={{color:'var(--m31-brand-bright)',marginLeft:2}}>*</span>}</div>
                    <div className="m31-ds-toggle-opts">
                      {['Instagram','Indicação de amiga','Igreja','Caravana','Comunidade Mulheres de Fé','Outro'].map(op => (
                        <button key={op} type="button" className={`m31-ds-toggle-btn${form.comoConheceu === op ? ' active' : ''}`}
                          style={{ flex:'0 0 auto', padding:'9px 12px' }}
                          onClick={() => set('comoConheceu')(op)}>
                          {form.comoConheceu === op && <svg viewBox="0 0 24 24" style={{width:11,height:11}}><polyline points="20 6 9 17 4 12"/></svg>}
                          {op}
                        </button>
                      ))}
                    </div>
                    {fieldErrors.comoConheceu && <div style={{ marginTop:6, fontSize:12, color:'#B42318' }}>{fieldErrors.comoConheceu}</div>}
                  </div>

                  )}

                  {/* Campos personalizados do builder */}
                  <ExtrasFields extras={extras} valores={valoresExtras} disabled={loading}
                    onChange={(id, v) => setValoresExtras(s => ({ ...s, [id]: v }))} />

                  <div style={{ margin:'4px 0 14px', padding:'12px 14px', borderRadius:14, background:'rgba(91,14,45,.06)' }}>
                    <div style={{ fontSize:14, fontWeight:800, color:'var(--m31-brand)' }}>Pagamento da Caravana</div>
                    <div style={{ fontSize:13, marginTop:3, color:'var(--m31-t2)' }}>Exclusivamente via PIX</div>
                  </div>

                  {/* Resumo preço */}
                  <div className="m31-ds-price-summary">
                    <div className="m31-ds-price-summary-label">
                      {T('resumo_label')}
                      <small>{T('resumo_sub')}</small>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:12, color:'var(--m31-t3)', textDecoration:'line-through', marginBottom:2 }}>
                        {loteValor != null ? `R$ ${loteValor.toFixed(2).replace('.', ',')}` : ''}
                      </div>
                      <div className="m31-ds-price-summary-amount">R$ 97,00</div>
                    </div>
                  </div>

                  {error && (
                    <div className="m31-ds-error">
                      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      {error}
                    </div>
                  )}

                  <div className="m31-ds-progress">
                    <div className="m31-ds-progress-track">
                      <div className="m31-ds-progress-fill" style={{ width: `${percentualProgresso}%` }}></div>
                    </div>
                    <div className="m31-ds-progress-label">
                      <span>{percentualProgresso}% completo</span>
                      <span style={{ color: camposFaltando === 0 ? '#22C55E' : 'var(--m31-brand-bright)' }}>
                        {camposFaltando === 0 ? '✓ Pronto!' : `Faltam ${camposFaltando} ${camposFaltando === 1 ? 'campo' : 'campos'}`}
                      </span>
                    </div>
                  </div>

                  <button className="m31-ds-btn-primary" onClick={handleSubmit} disabled={loading || loadingCaravanas || loadingRetomada || camposFaltando > 0}>
                    {camposFaltando > 0
                      ? `${T('btn_preencha_prefixo')} ${camposFaltando} ${camposFaltando === 1 ? 'campo' : 'campos'} ${T('btn_preencha_sufixo')}`
                      : loading ? <>Processando<span className="m31-ds-dots"><span/><span/><span/></span></> : T('btn_submit')}
                  </button>

                  <div className="m31-ds-footer">
                    <a href="https://api.whatsapp.com/send?phone=5581982800508&text=Oi!%20Tenho%20uma%20d%C3%BAvida%20sobre%20a%20caravana"
                      target="_blank" rel="noreferrer" className="m31-ds-wpp-btn">
                      <svg viewBox="0 0 24 24" style={{width:16,height:16,fill:'#22C55E',flexShrink:0}}>
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.128.558 4.127 1.534 5.862L.057 23.386a.75.75 0 0 0 .917.943l5.701-1.497A11.946 11.946 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.716 9.716 0 0 1-4.953-1.355l-.355-.21-3.683.967.983-3.596-.23-.37A9.716 9.716 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
                      </svg>
                      {T('footer_suporte')}
                    </a>
                    <div className="m31-ds-security">
                      <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      {T('footer_seguranca')}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="success" className="m31-ds-success"
                  initial={{ opacity:0, y:18 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45 }}>
                  <div className="m31-ds-check-ring">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3>{T('sucesso_titulo')}</h3>
                  <p style={{ whiteSpace: 'pre-line' }}>
                    {T('sucesso_texto').replace('{caravana}', caravanaSelecionada?.nome || '')}
                  </p>
                  {payUrl && (
                    <a href={payUrl} target="_blank" rel="noreferrer" className="m31-ds-btn-pay">
                      {T('sucesso_btn')}
                    </a>
                  )}
                  <a href="https://api.whatsapp.com/send?phone=5581982800508&text=Oi!%20Acabei%20de%20me%20inscrever%20pela%20caravana" target="_blank" rel="noreferrer"
                    style={{ fontSize:'13px', color:'var(--m31-brand-bright)', display:'block', marginTop:'10px' }}>
                    {T('sucesso_suporte')}
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="m31-ds-powered">{T('powered')}</div>
      </div>
    </div>
  );
}