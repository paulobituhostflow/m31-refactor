import { useState, useMemo, useEffect, useRef } from 'react';
import { COORDENADORES } from '@/lib/m31Coordenadores';
import { Search, Check, ChevronDown, LogIn, Mail, X } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const C = {
  ivory: '#F7F3F0',
  bordo: '#8B1A2B',
  white: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#756B66',
  border: '#E8DED8',
  beigeHighlight: '#F2D4BD',
  danger: '#DC2626',
  success: '#16A34A',
};

const AREA_NAMES = {
  coordenacao: 'Coordenação',
  inscricoes: 'Inscrições',
  logistica: 'Logística',
  midia: 'Mídia',
  lojinha: 'Lojinha',
  louvor: 'Louvor',
  intercessao: 'Intercessão',
};

function getFuncao(c) {
  if (c.super_user) return 'Acesso geral';
  return AREA_NAMES[c.area_slug] || c.area_slug || '';
}

function getInitials(nome) {
  return nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

/**
 * BoasVindasSelector — tela inicial do acesso simplificado.
 * Visual refatorado: cabeçalho bordô, card branco sobreposto, bottom sheet para seleção.
 * Lógica de permissões e dados mantida intacta.
 */
export default function BoasVindasSelector({ onSave }) {
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [emailTocado, setEmailTocado] = useState(false);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return COORDENADORES;
    return COORDENADORES.filter(c => c.nome.toLowerCase().includes(q));
  }, [busca]);

  const handleSelecionar = (c) => {
    setSelecionado(c);
    setBusca('');
    setSheetOpen(false);
  };

  const emailValido = EMAIL_RE.test(email.trim());
  const podeEntrar = selecionado && emailValido;

  const handleEntrar = () => {
    if (!podeEntrar) return;
    onSave({
      nome: selecionado.nome,
      email: email.trim().toLowerCase(),
      area_slug: selecionado.area_slug || null,
      super_user: selecionado.super_user || false,
    });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: C.ivory,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* ── Cabeçalho bordô (~30vh) ── */}
      <div style={{
        background: C.bordo,
        minHeight: '28vh',
        padding: '32px 24px 56px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        flexShrink: 0,
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: 'rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '6px',
        }}>
          <span style={{ color: C.white, fontSize: '15px', fontWeight: '800', letterSpacing: '0.02em' }}>M31</span>
        </div>
        <h1 style={{ color: C.white, fontSize: '20px', fontWeight: '700', margin: 0, lineHeight: '1.3' }}>
          Gestão de Tarefas
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '13px', margin: 0 }}>
          M31 Filhas 2026
        </p>
      </div>

      {/* ── Card branco sobreposto ── */}
      <div style={{
        flex: 1,
        marginTop: '-32px',
        background: C.white,
        borderRadius: '20px 20px 0 0',
        padding: '24px 20px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxWidth: '480px',
        width: '100%',
        alignSelf: 'center',
      }}>
        {/* Marca do evento */}
        <div style={{ textAlign: 'center', marginBottom: '2px' }}>
          <span style={{ fontSize: '17px', fontWeight: '800', color: C.textPrimary, letterSpacing: '0.08em' }}>
            M31 FILHAS
          </span>
        </div>

        {/* Subtítulo */}
        <p style={{ textAlign: 'center', fontSize: '14px', color: C.textSecondary, margin: 0 }}>
          Selecione seu nome para continuar
        </p>

        {/* ── Campo nome (trigger do bottom sheet) ── */}
        <div>
          <label style={{ fontSize: '12px', color: C.textSecondary, fontWeight: '500', display: 'block', marginBottom: '6px' }}>
            Nome
          </label>
          <button
            onClick={() => setSheetOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              minHeight: '48px',
              padding: '0 14px',
              background: C.white,
              border: `1px solid ${selecionado ? C.bordo : C.border}`,
              borderRadius: '10px',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            {selecionado ? (
              <>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  background: C.beigeHighlight,
                  color: C.bordo,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', fontWeight: '700', flexShrink: 0,
                }}>
                  {getInitials(selecionado.nome)}
                </div>
                <span style={{ fontSize: '15px', fontWeight: '600', color: C.textPrimary, flex: 1 }}>
                  {selecionado.nome}
                </span>
                <Check size={16} color={C.bordo} />
              </>
            ) : (
              <>
                <Search size={16} color={C.textSecondary} />
                <span style={{ fontSize: '15px', color: C.textSecondary, flex: 1 }}>
                  Selecione seu nome...
                </span>
                <ChevronDown size={16} color={C.textSecondary} />
              </>
            )}
          </button>
        </div>

        {/* ── E-mail (após seleção) ── */}
        {selecionado && (
          <div>
            <label style={{ fontSize: '12px', color: C.textSecondary, fontWeight: '500', display: 'block', marginBottom: '6px' }}>
              Seu e-mail
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minHeight: '48px',
              padding: '0 14px',
              background: C.white,
              border: `1px solid ${emailTocado && !emailValido ? C.danger : emailValido ? C.bordo : C.border}`,
              borderRadius: '10px',
            }}>
              <Mail size={16} color={C.textSecondary} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onBlur={() => setEmailTocado(true)}
                placeholder="voce@email.com"
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  fontSize: '15px', color: C.textPrimary, width: '100%',
                  fontFamily: 'inherit',
                }}
              />
              {emailValido && <Check size={16} color={C.success} />}
            </div>
            {emailTocado && !emailValido && (
              <span style={{ fontSize: '12px', color: C.danger, marginTop: '4px', display: 'block' }}>
                Informe um e-mail válido.
              </span>
            )}
          </div>
        )}

        {/* ── Botão Entrar ── */}
        {selecionado && (
          <button
            onClick={handleEntrar}
            disabled={!podeEntrar}
            style={{
              minHeight: '48px',
              width: '100%',
              background: podeEntrar ? C.bordo : C.border,
              color: podeEntrar ? C.white : C.textSecondary,
              border: 'none',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: '700',
              cursor: podeEntrar ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontFamily: 'inherit',
            }}
          >
            <LogIn size={18} /> Entrar na gestão
          </button>
        )}

        {/* ── Aviso ── */}
        {selecionado && (
          <p style={{ fontSize: '11px', color: C.textSecondary, textAlign: 'center', lineHeight: '1.5', margin: 0 }}>
            Identificação autodeclarada. Nome e e-mail serão registrados nas ações de criação, edição e conclusão de tarefas.
          </p>
        )}
      </div>

      {/* ── Bottom Sheet: Seletor de pessoas ── */}
      {sheetOpen && (
        <PeopleBottomSheet
          busca={busca}
          setBusca={setBusca}
          filtrados={filtrados}
          selecionado={selecionado}
          onSelect={handleSelecionar}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * PeopleBottomSheet — seletor de pessoas em bottom sheet mobile.
 * - Gesto de arraste ISOLADO no puxador superior (touchAction: none).
 * - Lista interna rola independentemente (overscroll-behavior: contain).
 * - Altura em dvh (adapta ao teclado do iOS).
 * - Lock de scroll robusto (html + body + overscroll-behavior).
 * - Única transição de transform, sem animações duplicadas.
 */
function PeopleBottomSheet({ busca, setBusca, filtrados, selecionado, onSelect, onClose }) {
  const sheetRef = useRef(null);
  const startYRef = useRef(0);
  const dragYRef = useRef(0);
  const draggingRef = useRef(false);

  // Lock de scroll do fundo
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      body.style.overscrollBehavior = '';
    };
  }, []);

  // Animação de entrada: translateY(100%) → translateY(0), uma única transição
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transform = 'translateY(100%)';
    el.style.transition = 'none';
    // Force reflow para garantir o ponto de partida
    void el.offsetHeight;
    el.style.transition = 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)';
    el.style.transform = 'translateY(0)';
  }, []);

  // Gesto de arraste — handlers apenas no puxador
  const onHandleTouchStart = (e) => {
    draggingRef.current = true;
    startYRef.current = e.touches[0].clientY;
    dragYRef.current = 0;
    const el = sheetRef.current;
    if (el) el.style.transition = 'none';
  };

  const onHandleTouchMove = (e) => {
    if (!draggingRef.current) return;
    const dy = e.touches[0].clientY - startYRef.current;
    if (dy > 0) {
      dragYRef.current = dy;
      const el = sheetRef.current;
      if (el) el.style.transform = `translateY(${dy}px)`;
    }
  };

  const onHandleTouchEnd = () => {
    draggingRef.current = false;
    const el = sheetRef.current;
    const THRESHOLD = 100;
    if (dragYRef.current > THRESHOLD) {
      // Fechar com animação de saída
      if (el) {
        el.style.transition = 'transform 0.22s ease-in';
        el.style.transform = 'translateY(100%)';
      }
      setTimeout(onClose, 200);
    } else {
      // Retornar à posição
      if (el) {
        el.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
        el.style.transform = 'translateY(0)';
      }
    }
    dragYRef.current = 0;
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      overscrollBehavior: 'none',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'relative',
          background: C.white,
          borderRadius: '16px 16px 0 0',
          maxHeight: '85dvh',
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Puxador — ÚNICA área com gesto de arraste */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '8px',
            paddingBottom: '8px',
            flexShrink: 0,
            cursor: 'grab',
            touchAction: 'none',
          }}
        >
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: C.border }} />
        </div>

        {/* Título + fechar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 16px 12px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '16px', fontWeight: '700', color: C.textPrimary }}>
            Selecione seu nome
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: C.textSecondary, minHeight: '36px', minWidth: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} />
          </button>
        </div>

        {/* Search fixo */}
        <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            minHeight: '44px',
            padding: '0 12px',
            background: C.ivory,
            borderRadius: '10px',
            border: `1px solid ${C.border}`,
          }}>
            <Search size={16} color={C.textSecondary} />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              style={{
                background: 'none', border: 'none', outline: 'none',
                fontSize: '16px', color: C.textPrimary, width: '100%',
                fontFamily: 'inherit', minHeight: '44px',
              }}
            />
            {busca && (
              <button onClick={() => setBusca('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.textSecondary, minHeight: '36px', minWidth: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Lista scrollável — sem handlers de toque, scroll isolado */}
        <div style={{
          overflowY: 'auto',
          flex: 1,
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}>
          {filtrados.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: C.textSecondary, fontSize: '14px' }}>
              Nenhum nome encontrado
            </div>
          )}
          {filtrados.map((c, i) => {
            const isSelected = selecionado?.nome === c.nome;
            return (
              <button
                key={i}
                onClick={() => onSelect(c)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '100%',
                  minHeight: '56px',
                  padding: '8px 16px',
                  background: isSelected ? C.beigeHighlight : 'transparent',
                  border: 'none',
                  borderTop: i > 0 ? `1px solid ${C.border}` : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%',
                  background: isSelected ? C.bordo : C.ivory,
                  color: isSelected ? C.white : C.bordo,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '13px', fontWeight: '700', flexShrink: 0,
                }}>
                  {getInitials(c.nome)}
                </div>
                {/* Nome + função */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: C.textPrimary }}>
                    {c.nome}
                  </div>
                  <div style={{ fontSize: '12px', color: C.textSecondary }}>
                    {getFuncao(c)}
                  </div>
                </div>
                {isSelected && <Check size={18} color={C.bordo} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}