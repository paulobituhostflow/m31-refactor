// M31 Inscrição — Público Geral · Design System Unificado
import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import { M31GlobalStyles } from '@/lib/m31Design.jsx';
import { themeVars } from '@/lib/m31VisualTheme';
import { M31Logo } from '@/components/M31Logo';
import GiftTicketToggle from '@/components/m31/GiftTicketToggle';
import GiftConfirmScreen from '@/components/m31/GiftConfirmScreen';
import InscricaoRecuperadaBanner from '@/components/m31/forms/InscricaoRecuperadaBanner';
import ShirtOrderBump from '@/components/m31/ShirtOrderBump';
import { alertaTelefone } from '@/lib/m31Normalizar';
import { usePublicFormConfig } from '@/hooks/usePublicFormConfig';
import ExtrasFields from '@/components/m31/forms/ExtrasFields';
import { serializarExtras } from '@/components/m31/builder/publicFormsCatalog';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

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
function phoneDigits(m) { return m.replace(/\D/g,''); }

// ── Float Field ────────────────────────────────────────────────────────────────
function Field({ label, required, hint, value, state, feedback, children }) {
  const [focused, setFocused] = useState(false);
  const cls = ['m31-ds-field', focused ? 'active' : '', value ? 'filled' : '', state === 'error' ? 'has-error' : '', state === 'valid' ? 'has-success' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} onFocusCapture={() => setFocused(true)} onBlurCapture={() => setFocused(false)}>
      <span className="m31-ds-label">{label}{required && <span className="req">*</span>}</span>
      {children}
      {hint && <div className="m31-ds-field-hint">{hint}</div>}
      {feedback && (
        <div className={`m31-ds-field-feedback ${state === 'error' ? 'err' : 'ok'}`}>
          {state === 'error'
            ? <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          }
          {feedback}
        </div>
      )}
    </div>
  );
}

// ── Validators ─────────────────────────────────────────────────────────────────
const validateNome = v => !v.trim() ? [null,null] : v.trim().split(/\s+/).length < 2 ? ['error','Inclua o sobrenome'] : ['valid',null];
const validateEmail = v => !v.trim() ? [null,null] : !v.includes('@') || !v.includes('.') ? ['error','E-mail inválido'] : ['valid',null];
// Assistivo: nunca marca "error" por formatação — apenas sugere a conferência.
const validateWpp = d => d.length === 0 ? [null,null] : d.length < 10 ? [null, null] : ['valid',null];
const validateCPF = v => { const d = v.replace(/\D/g,''); return d.length === 0 ? [null,null] : d.length < 11 ? ['error',`${d.length}/11 dígitos`] : ['valid',null]; };

// ── Main ───────────────────────────────────────────────────────────────────────
export default function M31Inscricao() {
  // Detectar token de convite na URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setIsResgate(true);
      // Aqui você buscaria o registro do presenteado para pré-preencher dados
      base44.entities.EventoM31Inscricao.get(token).then(insc => {
        setResgateLote(insc?.lote);
      }).catch(() => {});
    }
  }, []);

  // Carregar lote ativo na inicialização
  useEffect(() => {
    base44.entities.EventoM31Lote.filter({ ativo: true }, '-ordem', 1)
      .then(lotes => {
        if (lotes.length > 0) {
          setLoteAtivo(lotes[0]);
          setTotalValue(lotes[0].valor);
        }
      })
      .catch(() => {});
  }, []);

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

  const [form, setForm] = useState({ nome:'', email:'', whatsapp:'', cpf:'', cidade:'', estado:'', comoConheceu:'' });
  const [fieldStates, setFieldStates] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payUrl, setPayUrl] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitTouched, setSubmitTouched] = useState(false);
  const [leadId, setLeadId] = useState(null);
  const leadCapturedRef = useRef(false);
  // Tela de confirmação "Você está abençoando…" (só no fluxo gift)
  const [confirmGift, setConfirmGift] = useState(false);

  // Gift Ticket Logic
  const [isGift, setIsGift] = useState(false);
  const [giftWhatsapp, setGiftWhatsapp] = useState('');
  const [giftNome, setGiftNome] = useState('');
  const [giftEmail, setGiftEmail] = useState('');
  const [loteAtivo, setLoteAtivo] = useState(null);
  const [totalValue, setTotalValue] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [installments, setInstallments] = useState(1);
  const [isResgate, setIsResgate] = useState(false);
  const [resgateLote, setResgateLote] = useState(null);
  const [existingInscricao, setExistingInscricao] = useState(null);
  const [checkedPhone, setCheckedPhone] = useState('');
  const [shirtOffer, setShirtOffer] = useState(null);
  const [shirtSelection, setShirtSelection] = useState({ modelo: '', tamanho: '' });
  const [cupomInput, setCupomInput] = useState('');
  const [cupomAplicado, setCupomAplicado] = useState('');
  const [cupomErro, setCupomErro] = useState('');
  // Builder 360: configuração editável do formulário (banner, textos, campos).
  // Sempre inicia com os defaults — a página nunca quebra com config ausente.
  const { T, campo, extras, config } = usePublicFormConfig('inscricao');
  const [valoresExtras, setValoresExtras] = useState({});

  // Oferta pública de camisa: somente configuração/estoque do servidor.
  useEffect(() => {
    base44.functions.invoke('m31CamisasOfertaPublica', {})
      .then((res) => setShirtOffer(res?.data || res || null))
      .catch(() => setShirtOffer(null));
  }, []);

  // Retomada após instabilidade: pré-preenche com os dados já informados
  useEffect(() => {
    const retomar = new URLSearchParams(window.location.search).get('retomar');
    if (!retomar) return;
    base44.functions.invoke('m31ConsultarFalhaCheckout', { token: retomar })
      .then(res => {
        const d = res.data?.dados;
        if (!d) return;
        setForm(f => ({
          ...f,
          nome: d.nome || f.nome,
          email: d.email || f.email,
          whatsapp: d.whatsapp ? maskPhone(d.whatsapp.replace(/^55/, '')) : f.whatsapp,
          cpf: d.cpf ? maskCPF(d.cpf) : f.cpf,
          cidade: d.cidade || f.cidade,
          estado: d.estado || f.estado,
          comoConheceu: d.como_conheceu || f.comoConheceu,
        }));
      })
      .catch(() => {});
  }, []);

  // Buscar inscrição existente por email na URL (load inicial)
  useEffect(() => {
    const emailParam = new URLSearchParams(window.location.search).get('email');
    if (!emailParam) return;
    base44.entities.EventoM31Inscricao.filter({ email: emailParam }, '-created_date', 1)
      .then(results => {
        if (results.length > 0) {
          setExistingInscricao(results[0]);
          setForm(f => ({
            ...f,
            nome: results[0].nome || f.nome,
            email: results[0].email || f.email,
            whatsapp: results[0].whatsapp ? results[0].whatsapp.replace(/^55/, '') : f.whatsapp,
            cpf: results[0].cpf ? results[0].cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : f.cpf,
            cidade: results[0].cidade || f.cidade,
            estado: results[0].estado || f.estado,
          }));
          setCheckedPhone(phoneDigits(results[0].whatsapp || ''));
        }
      })
      .catch(() => {});
  }, []);

  const wppDigits = phoneDigits(form.whatsapp);

  // Verificar inscrição duplicada ao mudar WhatsApp
  useEffect(() => {
    const debounce = setTimeout(async () => {
      const digits = phoneDigits(form.whatsapp);
      if (digits.length === 11 && digits !== checkedPhone) {
        try {
          const fullPhone = '55' + digits;
          const existing = await base44.entities.EventoM31Inscricao.filter(
            { whatsapp: fullPhone },
            '-created_date',
            1
          );
          if (existing.length > 0) {
            setExistingInscricao(existing[0]);
            // Pré-preencher campos da inscrição anterior
            setForm(f => ({
              ...f,
              nome: existing[0].nome || f.nome,
              email: existing[0].email || f.email,
              cpf: existing[0].cpf ? existing[0].cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : f.cpf,
              cidade: existing[0].cidade || f.cidade,
              estado: existing[0].estado || f.estado,
            }));
          } else {
            setExistingInscricao(null);
          }
          setCheckedPhone(digits);
        } catch (_) {
          setExistingInscricao(null);
        }
      }
    }, 500);
    return () => clearTimeout(debounce);
  }, [form.whatsapp, checkedPhone]);

  /**
   * REGRA PERMANENTE: com Nome + WhatsApp válido, a intenção é persistida ANTES
   * de qualquer etapa que possa falhar. Ponto único: m31RegistrarIntencao.
   * Idempotente — sempre avança o MESMO registro, nunca cria um por tentativa.
   */
  async function registrarIntencao(etapa = 'contato_capturado', extra = {}) {
    const nomeValido = form.nome.trim().split(/\s+/).length >= 2;
    if (!nomeValido || wppDigits.length < 8) return null;
    try {
      const res = await base44.functions.invoke('m31RegistrarIntencao', {
        nome: form.nome.trim(),
        whatsapp: '55' + wppDigits,
        cpf: form.cpf.replace(/\D/g, ''),
        email: form.email.trim().toLowerCase(),
        cidade: form.cidade.trim(),
        estado: form.estado,
        como_conheceu: form.comoConheceu || undefined,
        lote: loteAtivo?.codigo || null,
        etapa,
        ...extra,
      });
      const id = res.data?.inscricao_id;
      if (id) { setLeadId(id); leadCapturedRef.current = true; }
      return res.data || null;
    } catch (_) { return null; }
  }

  function blurValidate(field) {
    const map = { nome: () => validateNome(form.nome), email: () => validateEmail(form.email), whatsapp: () => validateWpp(wppDigits), cpf: () => validateCPF(form.cpf), cidade: () => form.cidade.trim() ? ['valid',null] : [null,null], estado: () => form.estado ? ['valid',null] : [null,null] };
    if (!map[field]) return;
    setFieldStates(s => ({ ...s, [field]: map[field]() }));
    if ((field === 'nome' || field === 'whatsapp') && !leadId) {
      setTimeout(() => registrarIntencao('contato_capturado'), 100);
    }
  }

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    if (fieldStates[field]) setFieldStates(s => ({ ...s, [field]: field === 'nome' ? validateNome(value) : field === 'email' ? validateEmail(value) : s[field] }));
  }

  const getState = f => fieldStates[f]?.[0] || null;
  const getMsg   = f => fieldStates[f]?.[1] || null;
  const toggleCls = f => submitTouched && !form[f] ? ' is-error' : form[f] ? ' is-valid' : '';

  function validate() {
    if (existingInscricao && existingInscricao.status_pagamento === 'aprovado') {
      return 'Você já está inscrita no M31 Filhas! Acesse seu WhatsApp para mais informações.';
    }
    if (!existingInscricao?.nome && (!form.nome.trim() || form.nome.trim().split(/\s+/).length < 2)) return 'Informe seu nome completo.';
    if (!existingInscricao?.email && (!form.email.trim() || !form.email.includes('@'))) return 'Informe um e-mail válido.';
    // Assistivo: só bloqueia contato impossível. Formato incomum segue com alerta.
    if (wppDigits.length < 8) return 'Informe seu WhatsApp com DDD. Ex.: (81) 99999-9999';
    if (form.cpf.replace(/\D/g,'').length !== 11) return 'CPF deve ter 11 dígitos.';
    if (campo('cidade').visivel && campo('cidade').obrigatorio && !form.cidade.trim()) return 'Informe sua cidade.';
    if (campo('estado').visivel && campo('estado').obrigatorio && !form.estado) return 'Selecione seu estado.';
    if (campo('comoConheceu').visivel && campo('comoConheceu').obrigatorio && !form.comoConheceu) return 'Responda como conheceu o M31.';
    for (const f of extras) {
      const v = String(valoresExtras[f.id] ?? '').trim();
      if (f.required && !v) return `Preencha o campo "${f.label}".`;
    }
    if (isGift && (!giftNome.trim() || giftNome.trim().split(/\s+/).length < 2)) return 'Informe o nome completo da pessoa presenteada.';
    if (isGift && giftWhatsapp.replace(/\D/g,'').length < 10) return 'Informe o WhatsApp da pessoa presenteada.';
    if ((shirtSelection.modelo && !shirtSelection.tamanho) || (!shirtSelection.modelo && shirtSelection.tamanho)) return 'Selecione o modelo e o tamanho da camisa.';
    return null;
  }

  async function handleSubmit() {
    setSubmitTouched(true);
    const errMsg = validate();
    if (errMsg) { setError(errMsg); return; }
    // Fluxo gift: antes de ir ao pagamento, mostra a tela de confirmação
    // "Você está abençoando…" para reduzir erro de telefone da presenteada.
    if (isGift && !confirmGift) {
      setError('');
      setConfirmGift(true);
      return;
    }
    setError(''); setLoading(true);
    try {
      // Se é inscrição existente em checkout_abandonado, atualizar em vez de criar
      if (existingInscricao && existingInscricao.status_pagamento === 'checkout_abandonado') {
        await base44.entities.EventoM31Inscricao.update(existingInscricao.id, {
          email: form.email.trim().toLowerCase(),
          cpf: form.cpf.replace(/\D/g,''),
          cidade: form.cidade.trim(),
          estado: form.estado,
          como_conheceu: form.comoConheceu || undefined,
        });
      } else {
        // Criar novo registro
        try {
          await base44.entities.Inscricoes.create({
            name: form.nome.trim(), email: form.email.trim().toLowerCase(),
            phone: '55' + wppDigits, cpf: form.cpf.replace(/\D/g,''),
            cidade: form.cidade.trim(), estado: form.estado,
            como_conheceu: form.comoConheceu || undefined,
            status: 'lead_capturado', source: 'formulario_inscricao',
            lote: loteAtivo?.codigo || null, priority: 'high', recovery_attempts: 0,
          });
        } catch (_) {}
      }

      // ── TRAVA ESTRUTURAL: intenção persistida ANTES de qualquer integração externa ──
      const intencao = await registrarIntencao('tentou_avancar', { ultima_acao: 'submit_checkout' });
      if (intencao?.ja_inscrita) {
        setError('Você já está inscrita no M31 Filhas! Acesse seu WhatsApp para mais informações.');
        setLoading(false);
        return;
      }

      const res = await base44.functions.invoke('m31CreatePayment', {
       nome: form.nome.trim(), email: form.email.trim().toLowerCase(),
       whatsapp: '55' + wppDigits, cpf: form.cpf.replace(/\D/g,''),
       cidade: form.cidade.trim(), estado: form.estado, tipo: 'publico_geral',
       como_conheceu: form.comoConheceu || undefined,
       isGift: isGift,
       presenteado_whatsapp: isGift ? '55' + giftWhatsapp.replace(/\D/g,'') : null,
       presenteado_nome: isGift ? giftNome.trim() : null,
       presenteado_email: isGift ? giftEmail.trim().toLowerCase() : null,
       inscricao_id: existingInscricao?.id || intencao?.inscricao_id || leadId,
       modelo_camisa: shirtSelection.modelo || null,
       tamanho_camisa: shirtSelection.tamanho || null,
       cupom_codigo: cupomAplicado || null,
       payment_method: paymentMethod,
       installments,
      });
      if (res.data?.payment_url) setPayUrl(res.data.payment_url);
      await registrarIntencao('checkout_criado', { ultima_acao: 'checkout_criado' });
      // Campos personalizados → observações do registro da inscrita (payload oficial intocado).
      const serialExtras = serializarExtras(extras, valoresExtras);
      const idInscricao = existingInscricao?.id || intencao?.inscricao_id || leadId;
      if (serialExtras && idInscricao) {
        const obsAtual = existingInscricao?.observacoes || '';
        const obsNova = [obsAtual, serialExtras].filter(Boolean).join(' | ');
        try { await base44.entities.EventoM31Inscricao.update(idInscricao, { observacoes: obsNova }); } catch (_) {}
      }
      setSuccess(true);
    } catch (e) {
      const status = e?.response?.status || 0;
      const msg = e?.response?.data?.error || e?.message || '';
      // ── REGRA: erro técnico (4xx/5xx/rede) ≠ abandono comercial ──
      // Registra falha técnica de checkout para recuperação segura depois.
      const falhaTecnica = !e?.response?.data?.error || status >= 500;
      if (falhaTecnica) {
        // Marca a falha NO PRÓPRIO registro da pessoa (onde parou + erro técnico)
        await registrarIntencao('tentou_avancar', {
          ultima_acao: 'falha_tecnica_checkout',
          falha_http: status, falha_erro: msg, falha_etapa: 'checkout',
        });
        try {
          await base44.functions.invoke('m31RegistrarFalhaCheckout', {
            nome: form.nome.trim(), email: form.email.trim().toLowerCase(),
            whatsapp: '55' + wppDigits, cpf: form.cpf.replace(/\D/g,''),
            cidade: form.cidade.trim(), estado: form.estado,
            como_conheceu: form.comoConheceu || undefined,
            is_gift: isGift, etapa: 'checkout',
            http_status: status, erro: msg,
          });
        } catch (_) {}
        setError('Tivemos uma instabilidade ao avançar para o pagamento. Seus dados foram salvos — vamos te chamar no WhatsApp com o link para continuar, ou tente novamente em instantes.');
      } else {
        setError(msg || 'Erro ao processar. Tente novamente ou fale com o suporte.');
      }
    } finally { setLoading(false); }
  }

  const isCls = f => getState(f) === 'valid' ? ' is-valid' : getState(f) === 'error' ? ' is-error' : '';
  const showCheck = f => getState(f) === 'valid';
  const CheckIcon = () => (
    <svg className="m31-ds-input-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
  );

  const shirtPrice = shirtSelection.modelo && shirtSelection.tamanho ? Number(shirtOffer?.preco || 0) : 0;
  const loteValorReal = Number(loteAtivo?.valor || totalValue || 0);
  const ingressoUnitario = cupomAplicado === 'ESPOSADELGND' ? 110 : loteValorReal;
  const qtdIngressosDisplay = isGift && giftWhatsapp.replace(/\D/g,'').length >= 10 ? 2 : 1;
  const ingressoTotalDisplay = ingressoUnitario * qtdIngressosDisplay;
  const economiaCupom = cupomAplicado === 'ESPOSADELGND' ? Math.max(0, (loteValorReal - 110) * qtdIngressosDisplay) : 0;
  const displayTotalValue = ingressoTotalDisplay + shirtPrice;
  const precoAvista = Math.round(displayTotalValue);
  const precoParcela = (displayTotalValue / 2).toFixed(2).replace('.', ',');
  const ticketCardBaseOptions = { 1: 144.84, 2: 147.47, 3: 149.19, 4: 151.95, 5: 152.79 };
  const ticketCardTotal = paymentMethod === 'CREDIT_CARD'
    ? Number((ticketCardBaseOptions[installments] * (displayTotalValue / 139)).toFixed(2))
    : displayTotalValue;
  const ticketInstallmentValue = Number((ticketCardTotal / installments).toFixed(2));

  return (
    <div className="m31-ds-page" style={themeVars(config.cores)}>
      <M31GlobalStyles />

      <div className="m31-ds-split">
        {/* ── Coluna esquerda escura (desktop) ── */}
        <aside className="m31-ds-aside">
          <div className="m31-ds-aside-logo">
            <M31Logo size="lg" />
          </div>
          <div className="m31-ds-aside-badge">{T('aside_badge_prefixo')}{loteAtivo?.nome || 'Lote atual'}</div>
          <div className="m31-ds-aside-title">{T('aside_title_a')} <em>{T('aside_title_em')}</em></div>
          <div className="m31-ds-aside-sub">
            {T('aside_sub')}
          </div>

          <div className="m31-ds-aside-meta">
            <div className="m31-ds-aside-meta-row">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {T('aside_meta_data')}
            </div>
            <div className="m31-ds-aside-meta-row">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {T('aside_meta_hora')}
            </div>
            <div className="m31-ds-aside-meta-row">
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {T('aside_meta_local')}
            </div>
          </div>

          <div className="m31-ds-invest">
            <div className="m31-ds-invest-label">Investimento</div>
            <div className="m31-ds-invest-row">
              <div className="m31-ds-invest-value"><span className="currency">R$</span>{precoAvista}</div>
              <div className="m31-ds-invest-sub">
                {isGift ? 'Sua inscrição + 1 presente' : `ou 2× de R$${precoParcela}`}
              </div>
            </div>
          </div>
        </aside>

        {/* ── Banner de imagem (mobile) ── */}
        <div className="m31-ds-banner">
          <img
            src={config.banner.url}
            alt={config.banner.alt}
          />
        </div>

        {/* ── Cabeçalho compacto (mobile) ── */}
        <div className="m31-ds-mobile-header">
          <div className="m31-ds-mh-top">
            <div className="m31-ds-mh-logo"><M31Logo size="lg" /></div>
            <div className="m31-ds-mh-price">
              <div className="m31-ds-mh-price-value"><span className="currency">R$</span>{precoAvista}</div>
              <div className="m31-ds-mh-price-sub">
                {isGift ? 'inscrição + 1 presente' : `ou 2× de R$${precoParcela}`}
              </div>
            </div>
          </div>
          <div className="m31-ds-mh-meta">
            <div className="m31-ds-mh-meta-cell">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {T('mobile_meta_data')}
            </div>
            <div className="m31-ds-mh-meta-cell">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {T('mobile_meta_hora')}
            </div>
            <div className="m31-ds-mh-meta-cell">
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {T('mobile_meta_local')}
            </div>
          </div>
        </div>

        {/* ── Coluna direita: formulário ── */}
        <main className="m31-ds-main">
          <div className="m31-ds-main-inner">
            <motion.div className="m31-ds-card" initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }}>
              <div className="m31-ds-body">
                <AnimatePresence mode="wait">
                  {!success && confirmGift ? (
                    <motion.div key="giftconfirm" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.28 }}>
                      <GiftConfirmScreen
                        nome={giftNome}
                        whatsapp={giftWhatsapp}
                        totalValue={displayTotalValue}
                        loading={loading}
                        onConfirm={handleSubmit}
                        onBack={() => { setConfirmGift(false); setError(''); }}
                      />
                    </motion.div>
                  ) : !success ? (
                    <motion.div key="form" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0, y:-8 }} transition={{ duration:0.28 }}>

                      <div className="m31-ds-form-head">
                        <div className="m31-ds-title">{T('aside_title_a')} <em>{T('aside_title_em')}</em></div>
                        <div className="m31-ds-subtitle">{T('form_sub')}</div>
                      </div>

                      <InscricaoRecuperadaBanner inscricao={existingInscricao} />

                      <div className="m31-ds-section">{T('sec_primeiros')}</div>

                      <Field label={campo('nome').label} required value={form.nome} state={getState('nome')} feedback={getMsg('nome')}>
                        <div className="m31-ds-input-wrap">
                          <input className={`m31-ds-input${isCls('nome')}`} type="text" autoComplete="name"
                            value={form.nome} onChange={e => handleChange('nome', e.target.value)} onBlur={() => blurValidate('nome')} />
                          {showCheck('nome') && <CheckIcon />}
                        </div>
                      </Field>

                      <Field label={campo('whatsapp').label} required value={form.whatsapp} state={getState('whatsapp')} feedback={getMsg('whatsapp')}
                        hint={<><span>{T('wpp_hint')}</span><span style={{ fontWeight:600, color: wppDigits.length >= 10 ? 'var(--m31-slate-500)' : undefined }}>{wppDigits.length}/11</span></>}>
                        <div className="m31-ds-input-wrap">
                          <input className={`m31-ds-input${isCls('whatsapp')}`} type="tel" autoComplete="tel"
                            value={form.whatsapp}
                            onChange={e => setForm(f => ({ ...f, whatsapp: maskPhone(e.target.value) }))}
                            onBlur={() => blurValidate('whatsapp')} />
                          {showCheck('whatsapp') && <CheckIcon />}
                        </div>
                        {alertaTelefone(form.whatsapp) && (
                          <div className="m31-ds-field-feedback" style={{ color: '#B45309', marginTop: 6 }}>
                            ⚠️ {alertaTelefone(form.whatsapp)}
                          </div>
                        )}
                      </Field>

                      {leadId && (
                        <div className="m31-ds-info-box" style={{ marginBottom:16 }}>
                          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          <span>{T('lead_salvo')}</span>
                        </div>
                      )}

                      <div className="m31-ds-section">{T('sec_dados')}</div>

                      <Field label={campo('email').label} required value={form.email} state={getState('email')} feedback={getMsg('email')}>
                        <div className="m31-ds-input-wrap">
                          <input className={`m31-ds-input${isCls('email')}`} type="email" autoComplete="email"
                            value={form.email} onChange={e => handleChange('email', e.target.value)} onBlur={() => blurValidate('email')} />
                          {showCheck('email') && <CheckIcon />}
                        </div>
                      </Field>

                      <Field label={campo('cpf').label} required value={form.cpf} state={getState('cpf')} feedback={getMsg('cpf')}>
                        <div className="m31-ds-input-wrap">
                          <input className={`m31-ds-input${isCls('cpf')}`} type="text" inputMode="numeric"
                            value={form.cpf} onChange={e => setForm(f => ({ ...f, cpf: maskCPF(e.target.value) }))} onBlur={() => blurValidate('cpf')} />
                          {showCheck('cpf') && <CheckIcon />}
                        </div>
                      </Field>

                      {(campo('cidade').visivel || campo('estado').visivel) && (
                      <div className="m31-ds-field-row">
                        {campo('cidade').visivel && (
                        <Field label={campo('cidade').label} required={campo('cidade').obrigatorio} value={form.cidade} state={getState('cidade')}>
                          <div className="m31-ds-input-wrap">
                            <input className={`m31-ds-input${isCls('cidade')}`} type="text"
                              value={form.cidade} onChange={e => handleChange('cidade', e.target.value)} onBlur={() => blurValidate('cidade')} />
                            {showCheck('cidade') && <CheckIcon />}
                          </div>
                        </Field>
                        )}
                        {campo('estado').visivel && (
                        <div style={{ flex:'0 0 88px' }}>
                          <Field label={campo('estado').label} required={campo('estado').obrigatorio} value={form.estado} state={getState('estado')}>
                            <div className="m31-ds-select-wrap">
                              <select className={`m31-ds-select${getState('estado') === 'valid' ? ' is-valid' : ''}`}
                                value={form.estado} onChange={e => { setForm(f => ({ ...f, estado: e.target.value })); setFieldStates(s => ({ ...s, estado: ['valid',null] })); }}>
                                <option value=""> </option>
                                {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                              </select>
                            </div>
                          </Field>
                        </div>
                        )}
                      </div>
                      )}

                      <div className="m31-ds-section">{T('sec_sobre')}</div>

                      {/* Como conheceu? — chips */}
                      {campo('comoConheceu').visivel && (
                      <div className={`m31-ds-toggle-card chips${toggleCls('comoConheceu')}`}>
                        <div className="m31-ds-toggle-q">Como conheceu o M31?<span>*</span></div>
                        <div className="m31-ds-toggle-opts">
                          {['Instagram','Indicação de amiga','Igreja','Caravana','Comunidade Mulheres de Fé','Outro'].map(op => (
                            <button key={op} type="button" className={`m31-ds-toggle-btn${form.comoConheceu === op ? ' active' : ''}`}
                              onClick={() => setForm(f => ({ ...f, comoConheceu: op }))}>
                              {form.comoConheceu === op && <svg viewBox="0 0 24 24" style={{width:11,height:11}}><polyline points="20 6 9 17 4 12"/></svg>}
                              {op}
                            </button>
                          ))}
                        </div>
                      </div>
                      )}

                      {/* Gift Ticket Toggle */}
                      {!isResgate && loteAtivo && (
                        <GiftTicketToggle 
                          isGift={isGift}
                          onGiftChange={setIsGift}
                          giftWhatsapp={giftWhatsapp}
                          onGiftWhatsappChange={setGiftWhatsapp}
                          giftNome={giftNome}
                          onGiftNomeChange={setGiftNome}
                          giftEmail={giftEmail}
                          onGiftEmailChange={setGiftEmail}
                          loteAtivo={loteAtivo}
                          onTotalChange={setTotalValue}
                        />
                      )}

                      {!isResgate && loteAtivo && !existingInscricao?.asaas_charge_url && (
                        <div style={{margin:'14px 0',padding:'14px',border:'1px solid #E8E0D4',borderRadius:14,background:'#FFFDFB'}}>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Tem um cupom?</div>
                          {!cupomAplicado ? <>
                            <div style={{display:'flex',gap:8}}>
                              <input value={cupomInput} disabled={loading} onChange={e=>{setCupomInput(e.target.value.toUpperCase());setCupomErro('')}} placeholder="Código do cupom" style={{flex:1,minWidth:0,padding:'11px 12px',border:'1px solid #D8CFC4',borderRadius:10,textTransform:'uppercase'}} />
                              <button type="button" disabled={loading||!cupomInput.trim()} onClick={()=>{const c=cupomInput.trim().toUpperCase();if(c==='ESPOSADELGND'){setCupomAplicado(c);setCupomErro('')}else{setCupomAplicado('');setCupomErro('Cupom inválido ou indisponível')}}} style={{padding:'0 14px',borderRadius:10,border:0,background:'#8B1F24',color:'#fff',fontWeight:700}}>Aplicar</button>
                            </div>
                            {cupomErro && <div style={{fontSize:12,color:'#A3262A',marginTop:7}}>{cupomErro}</div>}
                          </> : <div>
                            <div style={{fontSize:13,fontWeight:700,color:'#3C7A4A'}}>Cupom ESPOSADELGND aplicado ✓</div>
                            <div style={{marginTop:7,fontSize:14}}><span style={{textDecoration:'line-through',color:'#8B7770',marginRight:8}}>R$ {loteValorReal.toFixed(2).replace('.',',')}</span><strong>R$ 110,00</strong></div>
                            <div style={{fontSize:12,color:'#6F625A',marginTop:3}}>Você economizou R$ {Math.max(0,loteValorReal-110).toFixed(2).replace('.',',')} por ingresso</div>
                            <button type="button" onClick={()=>{setCupomAplicado('');setCupomInput('');setCupomErro('')}} style={{marginTop:7,padding:0,border:0,background:'transparent',color:'#8B1F24',fontSize:12,textDecoration:'underline'}}>Remover cupom</button>
                          </div>}
                        </div>
                      )}

                      {!isResgate && !existingInscricao?.asaas_charge_url && (
                        <ShirtOrderBump
                          offer={shirtOffer}
                          selection={shirtSelection}
                          onChange={setShirtSelection}
                          disabled={loading}
                        />
                      )}

                      {!isResgate && !existingInscricao?.asaas_charge_url && (
                        <section aria-label="Forma de pagamento" style={{ margin: '16px 0' }}>
                          <div className="m31-ds-section">Forma de pagamento</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                            {[
                              { value: 'PIX', label: 'PIX', sub: `R$ ${displayTotalValue.toFixed(2).replace('.', ',')}` },
                              { value: 'CREDIT_CARD', label: 'Cartão de crédito', sub: 'Em até 5x' },
                            ].map((option) => (
                              <button key={option.value} type="button" onClick={() => { setPaymentMethod(option.value); if (option.value === 'PIX') setInstallments(1); }}
                                aria-pressed={paymentMethod === option.value}
                                style={{ padding: '14px 10px', borderRadius: 14, border: paymentMethod === option.value ? '2px solid #8B1F24' : '1px solid #D8CFC4', background: paymentMethod === option.value ? '#FFF4F3' : '#FFF', textAlign: 'left' }}>
                                <strong style={{ display: 'block', color: '#1F2937' }}>{option.label}</strong>
                                <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#6B7280' }}>{option.sub}</span>
                              </button>
                            ))}
                          </div>
                          {paymentMethod === 'CREDIT_CARD' && (
                            <div style={{ display: 'grid', gap: 8 }}>
                              {[1, 2, 3, 4, 5].map((count) => {
                                const totalCard = Number((ticketCardBaseOptions[count] * (displayTotalValue / 139)).toFixed(2));
                                const parcela = Number((totalCard / count).toFixed(2));
                                return (
                                  <label key={count} className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 bg-white p-3 transition hover:border-gray-400"
                                    style={{ border: installments === count ? '2px solid #8B1F24' : '1px solid #E5E7EB' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <input type="radio" name="ticket-installments" value={count} checked={installments === count} onChange={() => setInstallments(count)} />
                                      <span className="text-base font-bold text-gray-900">{count}x de R$ {parcela.toFixed(2).replace('.', ',')}</span>
                                    </span>
                                    <span className="text-xs text-gray-500 font-normal">Total: R$ {totalCard.toFixed(2).replace('.', ',')}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      )}

                      <ExtrasFields extras={extras} valores={valoresExtras} disabled={loading}
                        onChange={(id, v) => setValoresExtras(s => ({ ...s, [id]: v }))} />

                      {error && (
                        <div className="m31-ds-error">
                          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          {error}
                        </div>
                      )}

                      <div style={{ position: 'sticky', bottom: 0, zIndex: 20, padding: '12px 0 calc(12px + env(safe-area-inset-bottom))', background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(8px)' }}>
                        <button className="m31-ds-btn-primary" onClick={handleSubmit} disabled={loading}>
                          {loading ? <>{T('btn_loading')}<span className="m31-ds-dots"><span/><span/><span/></span></> : paymentMethod === 'CREDIT_CARD' ? `Continuar com cartão em ${installments}x` : 'Continuar com PIX'}
                        </button>
                      </div>

                      <div className="m31-ds-footer">
                        <div className="m31-ds-security">
                          {T('footer_seguranca')}
                        </div>
                        <a href="https://api.whatsapp.com/send?phone=5581982800508&text=Oi!%20Pode%20me%20ajudar%20com%20minha%20inscri%C3%A7%C3%A3o%3F" target="_blank" rel="noreferrer">
                          {T('footer_ajuda')}
                        </a>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="success" className="m31-ds-success"
                      initial={{ opacity:0, y:18 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.45 }}>
                      <div className="m31-ds-check-ring">
                        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                      <h3>{T('sucesso_titulo')}</h3>
                      <p style={{ whiteSpace: 'pre-line' }}>{T('sucesso_texto')}</p>
                      <a href={payUrl || '#'} target="_blank" rel="noreferrer" className="m31-ds-btn-pay">
                        {T('sucesso_btn')}
                      </a>
                      <br />
                      <a href="https://api.whatsapp.com/send?phone=5581982800508&text=Oi!%20Acabei%20de%20me%20inscrever%20no%20M31%20%F0%9F%99%8C" target="_blank" rel="noreferrer"
                        style={{ fontSize:'13px', color:'var(--m31-slate-500)', display:'block', marginTop:'8px', textDecoration:'underline' }}>
                        {T('sucesso_suporte')}
                      </a>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="m31-ds-powered">{T('powered')}</div>
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}