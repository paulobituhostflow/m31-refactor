// M31 Servir — Voluntários · Design System Unificado
// Fluxos: novo (3 passos) | incompleto (3 passos com prefill) | so_camisa (tela única) | completo (tudo preenchido)
import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import { M31GlobalStyles } from '@/lib/m31Design.jsx';
import { themeVars } from '@/lib/m31VisualTheme';
import { M31Logo } from '@/components/M31Logo';
import IdentityBanner from '@/components/m31/forms/IdentityBanner';
import InscricaoRecuperadaBanner from '@/components/m31/forms/InscricaoRecuperadaBanner';
import IgrejaSelector from '@/components/m31/forms/IgrejaSelector';
import { useInscricaoExistente } from '@/hooks/useInscricaoExistente';
import { isConfirmadaComEvidencia, parseVoluntarioData } from '@/lib/m31VoluntarioUtils';
import { usePublicFormConfig } from '@/hooks/usePublicFormConfig';
import ExtrasFields from '@/components/m31/forms/ExtrasFields';
import { serializarExtras } from '@/components/m31/builder/publicFormsCatalog';

function maskPhone(r) {
  const d = r.replace(/\D/g,'').slice(0,11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,3)} ${d.slice(3,7)}-${d.slice(7)}`;
}
function maskCPF(r) {
  const d = r.replace(/\D/g,'').slice(0,11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

const VALOR_CAMISA = 60;
const SETORES = [
  { id: 'intercessao',     label: 'Intercessão',     desc: 'Oração e cobertura espiritual' },
  { id: 'voluntario_geral',label: 'Voluntário Geral', desc: 'Demais setores do evento' },
];
const TAMANHOS = ['PP','P','M','G','GG','XG'];
const TOTAL_STEPS = 3;
const STEP_META = [
  { num:1, title:'Vamos conhecer você',    sub:'Conte-nos um pouco sobre você' },
  { num:2, title:'Seu chamado',            sub:'Como você quer servir?' },
  { num:3, title:'Quase lá',               sub:'Confira tudo e finalize.' },
];

// ── Sub-components ─────────────────────────────────────────────────────────────
function SvField({ label, required, value, onChange, type = 'text', inputMode }) {
  const [active, setActive] = useState(false);
  return (
    <div className={`m31-ds-field${active ? ' active' : ''}${value ? ' filled' : ''}`}
      onFocus={() => setActive(true)} onBlurCapture={() => setActive(false)}>
      <span className="m31-ds-label">{label}{required && <span className="req">*</span>}</span>
      <input className="m31-ds-input" type={type} inputMode={inputMode} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function M31ServirForm() {
  // FORÇA BRUTA: Light mode no DOM
  React.useEffect(() => {
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

  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successCamisa, setSuccessCamisa] = useState(false);
  const [payUrl, setPayUrl] = useState('');
  const topRef = useRef(null);
  const [igrejas, setIgrejas] = useState([]);
  const [voluntarioProfile, setVoluntarioProfile] = useState(null);
  const [retomadaServidor, setRetomadaServidor] = useState(null);
  // Builder 360: configuração editável (banner, textos, etapas, campos) — defaults garantidos.
  const { T, campo, extras, bloco, config } = usePublicFormConfig('servir');
  const [valoresExtras, setValoresExtras] = useState({});

  const [form, setForm] = useState({
    nome:'', email:'', celular:'', cpf:'', igreja:'', igreja_nao_participo: false,
    setor:'', serviu_antes:'', tamanho_camisa:'',
    doar_camisa: false, doacao_destino:'', doacao_nome:'', doacao_whatsapp:'', doacao_tamanho:'',
  });
  const set = field => val => setForm(f => ({ ...f, [field]: val }));
  const setor = SETORES.find(s => s.id === form.setor);
  const valor = VALOR_CAMISA;
  const valorDoacao = form.doar_camisa ? VALOR_CAMISA : 0;
  const valorTotal = valor + valorDoacao;

  // ── Buscar inscrição existente por CPF/WhatsApp/e-mail ──
  const cpfLimpo = (form.cpf || '').replace(/\D/g, '');
  const wppLimpo = (form.celular || '').replace(/\D/g, '');
  const { inscricaoExistente } = useInscricaoExistente({
    cpf: cpfLimpo,
    whatsapp: wppLimpo,
    email: form.email,
    enabled: cpfLimpo.length === 11 || wppLimpo.length >= 10 || (form.email && form.email.includes('@')),
  });

  // ── Buscar igrejas conhecidas no banco ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('m31ListarIgrejasConhecidas', {});
        if (!cancelled && res.data?.igrejas) setIgrejas(res.data.igrejas);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Retomada pública segura pelo backend ──
  useEffect(() => {
    const tel = (form.celular || '').replace(/\D/g, '');
    const cpf = (form.cpf || '').replace(/\D/g, '');
    const em = (form.email || '').trim().toLowerCase();
    let cancelled = false;
    if (tel.length < 10 && cpf.length !== 11 && !em.includes('@')) { setRetomadaServidor(null); setPayUrl(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await base44.functions.invoke('m31VoluntarioPayment', { mode:'consultar', whatsapp: tel ? (tel.startsWith('55') ? tel : '55'+tel) : '', cpf, email: em });
        const d = res?.data?.inscricao;
        if (cancelled) return;
        if (!res?.data?.found || !d) { setRetomadaServidor(null); setPayUrl(null); return; }
        setRetomadaServidor(d);
        setForm(f => ({ ...f, nome:d.nome||f.nome, email:d.email||f.email, celular:d.whatsapp?d.whatsapp.replace(/^55/,''):f.celular, cpf:d.cpf||f.cpf, igreja:d.igreja||f.igreja, setor:d.setor||f.setor, tamanho_camisa:d.tamanho_camisa||f.tamanho_camisa, serviu_antes:d.serviu_antes||f.serviu_antes }));
        setPayUrl(d.payment_url && ['checkout_pendente','checkout_abandonado','pendente'].includes(d.status_pagamento) ? d.payment_url : null);
      } catch {}
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.celular, form.cpf, form.email]);

  // ── Buscar perfil de voluntária quando inscrição é encontrada ──
  useEffect(() => {
    if (!inscricaoExistente?.id) { setVoluntarioProfile(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const profiles = await base44.entities.EventoM31Voluntario.filter(
          { inscricao_id: inscricaoExistente.id }, '-updated_date', 1
        );
        if (!cancelled) setVoluntarioProfile(profiles?.[0] || null);
      } catch {
        if (!cancelled) setVoluntarioProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [inscricaoExistente?.id]);

  // ── Determinar modo do formulário ──
  // Uma inscrição já confirmada como Público Geral/Caravana não quita o
  // M31 Servir. Só uma inscrição do tipo voluntario pode encerrar este fluxo.
  const inscricaoVoluntaria = inscricaoExistente?.tipo === 'voluntario' ? inscricaoExistente : null;
  const confirmada = isConfirmadaComEvidencia(inscricaoVoluntaria) || (retomadaServidor?.tipo === 'voluntario' && retomadaServidor.confirmada === true);
  const temCamisa = !!(voluntarioProfile?.tamanho_camiseta || retomadaServidor?.tamanho_camisa);
  const perfilEncontrado = !!voluntarioProfile || retomadaServidor?.perfil_encontrado === true;
  const modoCompleto = confirmada && temCamisa && perfilEncontrado;
  const modoSoCamisa = confirmada && !temCamisa && perfilEncontrado;

  // Pre-fill dados da inscrição (apenas uma vez)
  const preenchidoRef = useRef(false);
  useEffect(() => {
    if (!inscricaoExistente || preenchidoRef.current) return;
    preenchidoRef.current = true;
    setForm(f => ({
      ...f,
      nome: inscricaoExistente.nome || f.nome,
      email: inscricaoExistente.email || f.email,
      celular: inscricaoExistente.whatsapp ? inscricaoExistente.whatsapp.replace(/^55/, '') : f.celular,
      cpf: inscricaoExistente.cpf || f.cpf,
      igreja: inscricaoExistente.nome_igreja || f.igreja,
      setor: inscricaoExistente.area_voluntario || f.setor,
    }));
  }, [inscricaoExistente]);

  // Pre-fill dados do perfil de voluntária (quando carregar)
  const preenchidoPerfilRef = useRef(false);
  useEffect(() => {
    if (!voluntarioProfile || preenchidoPerfilRef.current) return;
    preenchidoPerfilRef.current = true;
    const volData = parseVoluntarioData(voluntarioProfile);
    setForm(f => ({
      ...f,
      serviu_antes: volData.serviu_antes ? 'sim' : f.serviu_antes,
      tamanho_camisa: voluntarioProfile.tamanho_camiseta || volData.tamanho_camisa || f.tamanho_camisa,
    }));
  }, [voluntarioProfile]);

  function scrollTop() { topRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }); }

  function validateStep() {
    if (step === 1) {
      if (!form.nome.trim() || form.nome.trim().split(/\s+/).length < 2) return 'Informe nome completo.';
      if (!form.email.trim() || !form.email.includes('@')) return 'E-mail inválido.';
      if (form.celular.replace(/\D/g,'').length < 10) return 'WhatsApp inválido.';
      if (form.cpf.replace(/\D/g,'').length !== 11) return 'CPF deve ter 11 dígitos.';
      for (const f of extras) {
        const v = String(valoresExtras[f.id] ?? '').trim();
        if (f.required && !v) return `Preencha o campo "${f.label}".`;
      }
    }
    if (step === 2) {
      if (!form.setor) return 'Escolha o setor em que deseja servir.';
      if (!form.serviu_antes) return 'Responda se já serviu em algum M31.';
    }
    if (step === 3) {
      if (!form.tamanho_camisa) return 'Selecione o tamanho da camisa.';
      if (form.doar_camisa) {
        if (!form.doacao_destino) return 'Escolha para quem vai a camisa doada.';
        if (form.doacao_destino === 'especifica' && !form.doacao_nome.trim()) return 'Informe o nome da voluntária destinatária.';
      }
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(); if (err) { setError(err); return; }
    setError(''); setStep(s => s + 1); scrollTop();
  }
  function prevStep() { setError(''); setStep(s => s - 1); scrollTop(); }

  // ── Handler do modo simplificado (só camisa) ──
  async function handleConcluirCamisa() {
    if (!form.tamanho_camisa) { setError('Selecione o tamanho da camisa.'); return; }
    setError(''); setLoading(true);
    try {
      await base44.functions.invoke('m31VoluntarioPayment', {
        mode: 'so_camisa',
        inscricao_id: retomadaServidor?.id || inscricaoExistente?.id,
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase(),
        whatsapp: '55' + form.celular.replace(/\D/g,''),
        cpf: form.cpf.replace(/\D/g,''),
        setor: form.setor || inscricaoExistente?.area_voluntario || 'intercessao',
        tamanho_camisa: form.tamanho_camisa,
      });
      setSuccessCamisa(true);
    } catch (e) {
      setError('Erro ao concluir. Tente novamente ou fale com o suporte.');
    } finally { setLoading(false); }
  }

  async function handleSubmit() {
    const err = validateStep(); if (err) { setError(err); return; }
    setError(''); setLoading(true);
    try {
      const res = await base44.functions.invoke('m31VoluntarioPayment', {
        nome: form.nome.trim(), apelido:'',
        email: form.email.trim().toLowerCase(),
        whatsapp: '55' + form.celular.replace(/\D/g,''),
        cpf: form.cpf.replace(/\D/g,''),
        nascimento:'', cidade:'', estado:'',
        igreja: form.igreja.trim(),
        serviu_antes: form.serviu_antes === 'sim',
        quantos_m31_serviu: 0, areas_serviu: [],
        setor: form.setor, habilidades: [],         sobre_servir: serializarExtras(extras, valoresExtras),
        tamanho_camisa: form.tamanho_camisa,
        doar_camisa: form.doar_camisa,
        doacao_destino: form.doacao_destino,
        doacao_nome: form.doacao_nome.trim(),
        doacao_whatsapp: form.doacao_whatsapp ? '55' + form.doacao_whatsapp.replace(/\D/g,'') : '',
        doacao_tamanho: form.doacao_tamanho,
        valor,
        valor_total: valorTotal,
        inscricao_id: retomadaServidor?.id || inscricaoExistente?.id,
      });
      const data = res?.data || res;
      if (data?.ja_aprovado) {
        setSuccess(true);
        return;
      }
      if (!data?.payment_url) throw new Error(data?.error || 'Não foi possível abrir o pagamento.');
      setPayUrl(data.payment_url);
      // Checkout é a próxima etapa da inscrição: abrir imediatamente reduz a
      // impressão de que o formulário terminou sem permitir pagar.
      window.location.assign(data.payment_url);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Não foi possível abrir o pagamento.';
      setError(`${msg} Tente novamente ou fale com o suporte.`);
    } finally { setLoading(false); }
  }

  const meta = { title: T(`etapa${step}_titulo`), sub: T(`etapa${step}_sub`) };
  const progress = (step / TOTAL_STEPS) * 100;

  const exibirProgresso = !success && !successCamisa && !modoSoCamisa && !modoCompleto;

  return (
    <div className="m31-ds-page" style={themeVars(config.cores)}>
      <M31GlobalStyles />
      <div className="m31-ds-wrapper" ref={topRef} style={{ padding: '24px 20px 48px' }}>

        {/* Header */}
        <motion.div className="m31-ds-header" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45 }}>
          {/* Logo como apoio — menor e discreta */}
          <div style={{ width:'90px', maxWidth:'40%', display:'block', margin:'0 auto 10px', opacity:0.85 }}>
            <M31Logo size="sm" />
          </div>
          {/* Identidade principal do formulário */}
          <div style={{ fontSize:13, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--m31-brand)', marginBottom:10 }}>
            {T('kicker')}
          </div>
          <div className="m31-ds-title">{T('header_title_a')}<br /><em>{T('header_title_b')}</em></div>
          <div className="m31-ds-subtitle">{T('header_sub')}</div>
        </motion.div>

        {/* Banner de identidade — topo, uniforme em todos os formulários públicos */}
        <IdentityBanner />

        {/* Banner editável (opcional) */}
        {config.banner?.url && (
          <img src={config.banner.url} alt={config.banner.alt || ''} style={{ width: '100%', borderRadius: 16, marginBottom: 16, display: 'block' }} />
        )}

        {/* Progress */}
        {exibirProgresso && (
          <>
            <div style={{ textAlign:'center', marginBottom:'14px' }}>
              <span style={{ fontSize:13, fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--m31-brand)' }}>
                {T('rotulo')}
              </span>
            </div>
            <div className="m31-ds-progress">
              <div className="m31-ds-progress-track"><div className="m31-ds-progress-fill" style={{ width:`${progress}%` }} /></div>
              <div className="m31-ds-progress-label">
                <span>Etapa <strong>{step}</strong> de {TOTAL_STEPS}</span>
                <span>{Math.round(progress)}% concluído</span>
              </div>
            </div>
          </>
        )}

        <AnimatePresence mode="wait">
          {/* Sucesso — camisa concluída */}
          {successCamisa ? (
            <motion.div key="success-camisa" className="m31-ds-card" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}>
              <div className="m31-ds-body">
                <div className="m31-ds-success">
                  <div className="m31-ds-check-ring">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3>{T('sucesso_camisa_titulo')}</h3>
                  <p style={{ whiteSpace: 'pre-line' }}>
                    {T('sucesso_camisa_texto')}
                  </p>
                  <a href="https://api.whatsapp.com/send?phone=5581982800508&text=Oi!%20Tenho%20uma%20d%C3%BAvida%20sobre%20o%20M31%20Servir" target="_blank" rel="noreferrer"
                    style={{ fontSize:'13px', color:'var(--m31-brand-bright)', display:'block', marginTop:'8px' }}>
                    Dúvidas? Fale com a gente
                  </a>
                </div>
              </div>
            </motion.div>
          ) : success ? (
            <motion.div key="success" className="m31-ds-card" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}>
              <div className="m31-ds-body">
                <div className="m31-ds-success">
                  <div className="m31-ds-check-ring">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3>{T('sucesso_titulo')}</h3>
                  <p style={{ whiteSpace: 'pre-line' }}>
                    {T('sucesso_texto')}
                  </p>
                  {payUrl && <a href={payUrl} target="_blank" rel="noreferrer" className="m31-ds-btn-pay">{T('sucesso_btn_pagar')}</a>}
                  <a href="https://api.whatsapp.com/send?phone=5581982800508&text=Oi!%20Tenho%20uma%20d%C3%BAvida%20sobre%20o%20M31%20Servir" target="_blank" rel="noreferrer"
                    style={{ fontSize:'13px', color:'var(--m31-brand-bright)', display:'block', marginTop:'8px' }}>
                    Dúvidas? Fale com a gente
                  </a>
                </div>
              </div>
            </motion.div>
          ) : modoCompleto ? (
            <motion.div key="completo" className="m31-ds-card" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}>
              <div className="m31-ds-body">
                <div className="m31-ds-success">
                  <div className="m31-ds-check-ring">
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3>{T('completo_titulo')}</h3>
                  <p style={{ whiteSpace: 'pre-line' }}>
                    {T('completo_texto')}
                  </p>
                  <a href="https://api.whatsapp.com/send?phone=5581982800508&text=Oi!%20Tenho%20uma%20d%C3%BAvida%20sobre%20o%20M31%20Servir" target="_blank" rel="noreferrer"
                    style={{ fontSize:'13px', color:'var(--m31-brand-bright)', display:'block', marginTop:'8px' }}>
                    Dúvidas? Fale com a gente
                  </a>
                </div>
              </div>
            </motion.div>
          ) : modoSoCamisa ? (
            <motion.div key="so-camisa" className="m31-ds-card" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}>
              <div className="m31-ds-body">
                <div style={{ textAlign:'center', marginBottom:'20px' }}>
                  <div className="m31-ds-check-ring" style={{ marginBottom:'16px' }}>
                    <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3 style={{ fontFamily:"'Playfair Display', serif", fontSize:'24px', fontWeight:700, color:'var(--m31-ink)', marginBottom:'10px' }}>
                    Sua inscrição já está confirmada!
                  </h3>
                  <p style={{ fontSize:'14px', color:'var(--m31-slate-500)', lineHeight:1.6, marginBottom:'24px' }}>
                    Só precisamos do tamanho da sua camisa para concluir seu cadastro de voluntária.
                  </p>
                </div>

                <div className="m31-ds-section" style={{ textAlign:'center', justifyContent:'center' }}>Tamanho da camisa</div>
                <div className="m31-ds-camisa-grid">
                  {TAMANHOS.map(t => (
                    <button key={t} type="button" className={`m31-ds-camisa-btn${form.tamanho_camisa === t ? ' sel' : ''}`}
                      onClick={() => set('tamanho_camisa')(t)}>{t}</button>
                  ))}
                </div>
                {form.tamanho_camisa && (
                  <div style={{ textAlign:'center', fontSize:13, color:'var(--m31-t2)', marginBottom:18 }}>
                    ✓ Tamanho <strong>{form.tamanho_camisa}</strong> selecionado
                  </div>
                )}

                {error && (
                  <div className="m31-ds-error">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {error}
                  </div>
                )}

                <button className="m31-ds-btn-primary" onClick={handleConcluirCamisa} disabled={loading}>
                  {loading ? <>Concluindo<span className="m31-ds-dots"><span/><span/><span/></span></> : 'Concluir cadastro →'}
                </button>
                <a href="https://api.whatsapp.com/send?phone=5581982800508&text=Oi!%20Tenho%20uma%20d%C3%BAvida%20sobre%20o%20M31%20Servir" target="_blank" rel="noreferrer"
                  style={{ fontSize:'13px', color:'var(--m31-brand-bright)', display:'block', textAlign:'center', marginTop:'12px' }}>
                  Dúvidas? Fale com a gente
                </a>
              </div>
            </motion.div>
          ) : (
            <motion.div key={`step-${step}`} className="m31-ds-card"
              initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }}
              transition={{ duration:0.28 }}>

              {/* Step indicator — leve, sem card vermelho */}
              <div style={{ padding:'18px 22px 0', borderBottom:'1px solid var(--m31-border)', marginBottom:0 }}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.10em', textTransform:'uppercase', color:'var(--m31-brand)', marginBottom:3 }}>
                  Etapa {step} de {TOTAL_STEPS}
                </div>
                <div style={{ fontSize:18, fontWeight:700, color:'var(--m31-t1)', fontFamily:"'Playfair Display', serif", paddingBottom:14 }}>
                  {meta.title}
                  <span style={{ display:'block', fontSize:12, fontWeight:400, fontFamily:'Inter, sans-serif', color:'var(--m31-t2)', marginTop:2 }}>{meta.sub}</span>
                </div>
              </div>

              <div className="m31-ds-body">

                {/* ETAPA 1 — Dados */}
                {step === 1 && (
                  <>
                    <div className="m31-ds-section">{T('sec_dados')}</div>
                    <InscricaoRecuperadaBanner inscricao={inscricaoExistente} forcarEmAndamento={!!inscricaoExistente && !confirmada} />
                    <SvField label={campo('nome').label} required value={form.nome} onChange={set('nome')} />
                    <SvField label={campo('celular').label} required value={form.celular} onChange={v => set('celular')(maskPhone(v))} type="tel" />
                    <SvField label={campo('email').label} required value={form.email} onChange={set('email')} type="email" />
                    <SvField label={campo('cpf').label} required value={form.cpf} onChange={v => set('cpf')(maskCPF(v))} inputMode="numeric" />
                    <ExtrasFields extras={extras} valores={valoresExtras} disabled={loading}
                      onChange={(id, v) => setValoresExtras(s => ({ ...s, [id]: v }))} />
                    <IgrejaSelector
                      value={form.igreja}
                      naoParticipo={form.igreja_nao_participo}
                      knownChurches={igrejas}
                      onChange={(texto, np) => { set('igreja')(texto); set('igreja_nao_participo')(np); }}
                    />
                  </>
                )}

                {/* ETAPA 2 — Perfil */}
                {step === 2 && (
                  <>
                    <div className="m31-ds-section">{T('sec_chamado')}</div>
                    <div className="m31-ds-setor-grid">
                      {SETORES.map(s => {
                        const cp = campo(`setor_${s.id}`);
                        return (
                        <div key={s.id} className={`m31-ds-setor-item${form.setor === s.id ? ' sel' : ''}`} onClick={() => set('setor')(s.id)}>
                          <div className="m31-ds-setor-radio" />
                          <div style={{ flex:1 }}>
                            <div className="m31-ds-setor-name">{cp.label}</div>
                            <div className="m31-ds-setor-desc">{cp.helper}</div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    <div className="m31-ds-toggle-card">
                      <div className="m31-ds-toggle-q">{T('serviu_pergunta')}<span style={{color:'var(--m31-brand-bright)',marginLeft:2}}>*</span></div>
                      <div className="m31-ds-toggle-opts">
                        {[['sim','Sim'],['nao','Não']].map(([val,label]) => (
                          <button key={val} type="button" className={`m31-ds-toggle-btn${form.serviu_antes === val ? ' active' : ''}`}
                            onClick={() => set('serviu_antes')(val)}>{label}</button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* ETAPA 3 — Camisa + Revisão */}
                {step === 3 && (
                  <>
                    <div className="m31-ds-section" style={{ textAlign:'center', justifyContent:'center' }}>{T('sec_camisa')}</div>
                    <p style={{ fontSize:13, color:'var(--m31-t3)', textAlign:'center', lineHeight:1.5, marginBottom:4 }}>{T('camisa_help')}</p>
                    <div className="m31-ds-camisa-grid">
                      {TAMANHOS.map(t => (
                        <button key={t} type="button" className={`m31-ds-camisa-btn${form.tamanho_camisa === t ? ' sel' : ''}`}
                          onClick={() => set('tamanho_camisa')(t)}>{t}</button>
                      ))}
                    </div>
                    {form.tamanho_camisa && (
                      <div style={{ textAlign:'center', fontSize:13, color:'var(--m31-t2)', marginBottom:18 }}>
                        ✓ Tamanho <strong>{form.tamanho_camisa}</strong> selecionado
                      </div>
                    )}

                    {/* Doação de camisa (opcional — pode ser ocultada no builder) */}
                    {bloco('doacao') && (
                    <>
                    <div style={{
                      border:'1px solid var(--m31-border)', borderRadius:12, padding:'14px 16px', marginBottom:20,
                      cursor:'pointer', userSelect:'none', transition:'border-color .2s, background .2s',
                      background: form.doar_camisa ? 'var(--m31-accent)' : 'transparent',
                      borderColor: form.doar_camisa ? 'var(--m31-brand)' : 'var(--m31-border)',
                    }} onClick={() => set('doar_camisa')(!form.doar_camisa)}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{
                          width:22, height:22, borderRadius:6, border:'2px solid var(--m31-brand)',
                          flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                          background: form.doar_camisa ? 'var(--m31-brand)' : '#fff',
                        }}>
                          {form.doar_camisa && (
                            <svg viewBox="0 0 24 24" style={{ width:14, height:14 }} fill="none" stroke="#fff" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:'var(--m31-t1)' }}>{T('doar_titulo')}</div>
                          <div style={{ fontSize:12, color:'var(--m31-t3)', marginTop:2 }}>
                            {T('doar_desc').replace('{valor}', VALOR_CAMISA)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {form.doar_camisa && (
                      <div style={{ marginBottom:20, padding:'0 4px' }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--m31-t1)', marginBottom:10 }}>
                          {T('doacao_pergunta')}
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                          {[
                            { id:'especifica', label:T('doacao_op1_label'), desc:T('doacao_op1_desc') },
                            { id:'lideranca', label:T('doacao_op2_label'), desc:T('doacao_op2_desc') },
                          ].map(opt => (
                            <div key={opt.id} onClick={() => set('doacao_destino')(opt.id)}
                              style={{
                                border:`2px solid ${form.doacao_destino === opt.id ? 'var(--m31-brand)' : 'var(--m31-border)'}`,
                                borderRadius:10, padding:'12px 14px', cursor:'pointer',
                                background: form.doacao_destino === opt.id ? 'var(--m31-accent)' : 'transparent',
                                transition:'all .2s',
                              }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{
                                  width:18, height:18, borderRadius:'50%', border:'2px solid var(--m31-brand)',
                                  flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                                }}>
                                  {form.doacao_destino === opt.id && <div style={{ width:10, height:10, borderRadius:'50%', background:'var(--m31-brand)' }} />}
                                </div>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:600, color:'var(--m31-t1)' }}>{opt.label}</div>
                                  <div style={{ fontSize:11, color:'var(--m31-t3)' }}>{opt.desc}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {form.doacao_destino === 'especifica' && (
                          <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:12 }}>
                            <SvField label={T('doacao_campo_nome')} required value={form.doacao_nome} onChange={set('doacao_nome')} />
                            <SvField label={T('doacao_campo_wpp')} value={form.doacao_whatsapp} onChange={v => set('doacao_whatsapp')(maskPhone(v))} type="tel" />
                            <div>
                              <div style={{ fontSize:12, fontWeight:600, color:'var(--m31-t2)', marginBottom:8 }}>{T('doacao_campo_tamanho')}</div>
                              <div className="m31-ds-camisa-grid" style={{ justifyContent:'flex-start' }}>
                                {TAMANHOS.map(t => (
                                  <button key={t} type="button" className={`m31-ds-camisa-btn${form.doacao_tamanho === t ? ' sel' : ''}`}
                                    style={{ padding:'6px 14px', fontSize:12 }}
                                    onClick={() => set('doacao_tamanho')(form.doacao_tamanho === t ? '' : t)}>{t}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    </>
                    )}

                    <div style={{ height:1, background:'var(--m31-border)', margin:'4px 0 20px' }} />

                    <div className="m31-ds-review-section">
                      <div className="m31-ds-review-heading">{T('resumo_quem')}</div>
                      <div className="m31-ds-review-row"><span className="m31-ds-review-key">Nome</span><span className="m31-ds-review-val">{form.nome}</span></div>
                      <div className="m31-ds-review-row"><span className="m31-ds-review-key">WhatsApp</span><span className="m31-ds-review-val">{form.celular}</span></div>
                      {form.igreja && <div className="m31-ds-review-row"><span className="m31-ds-review-key">Igreja</span><span className="m31-ds-review-val">{form.igreja}</span></div>}
                    </div>

                    <div className="m31-ds-review-section">
                      <div className="m31-ds-review-heading">{T('resumo_voluntariado')}</div>
                      <div className="m31-ds-review-row"><span className="m31-ds-review-key">Setor</span><span className="m31-ds-review-val">{setor?.label || '—'}</span></div>
                      <div className="m31-ds-review-row"><span className="m31-ds-review-key">Tamanho da camisa</span><span className="m31-ds-review-val">{form.tamanho_camisa || '—'}</span></div>
                      {form.doar_camisa && (
                        <>
                          <div className="m31-ds-review-row">
                            <span className="m31-ds-review-key">Doação de camisa</span>
                            <span className="m31-ds-review-val">Sim</span>
                          </div>
                          <div className="m31-ds-review-row">
                            <span className="m31-ds-review-key">Destino</span>
                            <span className="m31-ds-review-val">
                              {form.doacao_destino === 'especifica' ? 'Voluntária específica' : 'Liderança direcionará'}
                            </span>
                          </div>
                          {form.doacao_destino === 'especifica' && form.doacao_nome && (
                            <div className="m31-ds-review-row">
                              <span className="m31-ds-review-key">Destinatária</span>
                              <span className="m31-ds-review-val">{form.doacao_nome}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="m31-ds-price-summary">
                      <div className="m31-ds-price-summary-label">
                        {T('resumo_titulo')}
                        <small>{campo(`setor_${form.setor}`).label || setor?.label || '—'}</small>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:8 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--m31-t2)' }}>
                          <span>Camisa (tamanho {form.tamanho_camisa || '—'})</span>
                          <span>R$ {valor}</span>
                        </div>
                        {form.doar_camisa && (
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'var(--m31-t2)' }}>
                            <span>Camisa doada ({form.doacao_destino === 'especifica' ? 'destinatária específica' : 'liderança direcionará'})</span>
                            <span>R$ {VALOR_CAMISA}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--m31-border)', paddingTop:8 }}>
                        <span style={{ fontSize:14, fontWeight:600, color:'var(--m31-t1)' }}>{T('total_label')}</span>
                        <span className="m31-ds-price-summary-amount" style={{ fontSize:22 }}>R$ {valorTotal}</span>
                      </div>
                    </div>
                  </>
                )}

                {error && (
                  <div className="m31-ds-error">
                    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {error}
                  </div>
                )}

                {step < TOTAL_STEPS ? (
                  <>
                    <button className="m31-ds-btn-primary" onClick={nextStep}>{T('btn_proximo')}</button>
                    {step > 1 && <button className="m31-ds-btn-secondary" onClick={prevStep}>{T('btn_voltar')}</button>}
                  </>
                ) : (
                  <>
                    <button className="m31-ds-btn-primary" onClick={handleSubmit} disabled={loading}>
                      {loading ? <>{T('btn_loading')}<span className="m31-ds-dots"><span/><span/><span/></span></> : T('btn_submit')}
                    </button>
                    <button className="m31-ds-btn-secondary" onClick={prevStep}>{T('btn_voltar_editar')}</button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="m31-ds-powered">M31 Filhas · Edição 2026 · Ju Beltrão</div>
      </div>
    </div>
  );
}
