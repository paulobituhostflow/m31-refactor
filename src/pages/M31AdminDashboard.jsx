import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import M31BentoDashboard from '@/components/m31/M31BentoDashboard';
import M31CriarEdicaoModal from '@/components/m31/M31CriarEdicaoModal';
import { LogOut, ChevronLeft, Home, CopyPlus, Link2, Check, FileSearch, RefreshCw } from 'lucide-react';

const T = {
  bg:     '#F7F5F2',
  card:   '#FFFFFF',
  border: '#EAE7E2',
  text:   '#2D2D2D',
  sec:    '#6B7280',
  muted:  '#B0ADA8',
  brand:  '#8B1A2B',
};

// ── ShareLinkButton ───────────────────────────────────────────────────────────
function ShareLinkButton() {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const link = `${window.location.origin}/gestao-rapida`;
    try { await navigator.clipboard.writeText(link); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = link; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };
  return (
    <button onClick={handleCopy} style={{
      fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px',
      background: copied ? '#DCFCE7' : '#F3F0EE', border: `1px solid ${copied ? '#16A34A' : T.border}`,
      borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', color: copied ? '#16A34A' : T.text,
      transition: 'all 0.15s',
    }}>
      {copied ? <Check size={14} /> : <Link2 size={14} />}
      {copied ? 'Link copiado!' : 'Compartilhar'}
    </button>
  );
}

// ── Header clean ──────────────────────────────────────────────────────────────
function AdminHeader({ user, onLogout }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.72)',
      backdropFilter: 'blur(16px) saturate(180%)',
      borderBottom: `1px solid ${T.border}`,
      padding: '14px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'sticky', top: 0, zIndex: 20,
    }}>
      <div>
        <h1 style={{
          margin: '0 0 2px 0', fontSize: '18px', fontWeight: '700',
          fontFamily: 'Inter, sans-serif',
          color: T.text, letterSpacing: '-0.02em',
        }}>
          M31 Filhas
        </h1>
        <p style={{ margin: '0', fontSize: '12px', color: T.sec }}>
          {user?.full_name || 'Operador'} · {user?.role === 'admin' ? 'Admin' : 'Operacional'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <ShareLinkButton />
        <a href="/auditoria-recuperacao-72h" style={{
          fontSize: '12px', color: '#8B1A2B', textDecoration: 'none',
          fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px',
          background: '#FEF3C7', border: `1px solid #FCD34D`,
          borderRadius: '8px', padding: '7px 12px',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#FDE68A'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#FEF3C7'; }}>
          <RefreshCw size={14} /> Recuperação 72h
        </a>
        <a href="/auditoria-pagamentos-72h" style={{
          fontSize: '12px', color: T.brand, textDecoration: 'none',
          fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px',
          background: '#FEF2F2', border: `1px solid #FECACA`,
          borderRadius: '8px', padding: '7px 12px',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#FEE2E2'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#FEF2F2'; }}>
          <FileSearch size={14} /> Auditoria 72h
        </a>
        <a href="/admin" style={{
          fontSize: '12px', color: T.text, textDecoration: 'none',
          fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px',
          background: '#F3F0EE', border: `1px solid ${T.border}`,
          borderRadius: '8px', padding: '7px 12px',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#EBE7E2'; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#F3F0EE'; }}>
          <Home size={14} strokeWidth={2.5} /> Home
        </a>
        <a href="/m31-admin?tab=dashboard" style={{
          fontSize: '12px', color: T.brand, textDecoration: 'none',
          fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px',
        }}>
          <ChevronLeft size={14} /> Painel completo
        </a>
        <button
          onClick={onLogout}
          style={{
            background: T.brand, color: '#fff',
            border: 'none', borderRadius: '8px',
            padding: '8px 16px', fontSize: '12px',
            fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <LogOut size={14} /> Sair
        </button>
      </div>
    </div>
  );
}

// ── Mini cards de métricas rápidas ────────────────────────────────────────────
function MiniMetrics({ auditoria, grupoData }) {
  const items = [
    { label: 'Pagas',      value: auditoria?.total_pagas || 0,     color: '#16A34A', href: '/m31-admin?tab=participantes&aba=inscricoes&status=aprovado' },
    { label: 'No Grupo',   value: auditoria?.total_no_grupo || 0,  color: '#2563EB', href: '/m31-admin?tab=participantes&aba=inscricoes&grupo=entrou' },
    { label: 'Fora Grupo', value: auditoria?.total_fora_grupo || 0,color: '#DC2626', href: '/m31-admin?tab=participantes&aba=inscricoes&grupo=fora' },
    { label: 'Membros',    value: grupoData?.total_membros || 0,   color: T.brand,   href: '/m31-admin?tab=participantes&aba=mensagens' },
  ];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '10px', marginBottom: '16px',
    }}>
      {items.map((item, i) => (
        <a key={i} href={item.href} style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: '12px', padding: '14px 16px',
          textAlign: 'center', textDecoration: 'none',
          cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = item.color; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; }}>
          <div style={{ fontSize: '22px', fontWeight: '700', color: item.color, letterSpacing: '-0.02em' }}>
            {item.value.toLocaleString('pt-BR')}
          </div>
          <div style={{ fontSize: '11px', color: T.sec, marginTop: '2px' }}>{item.label}</div>
        </a>
      ))}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function M31AdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [auditoria, setAuditoria] = useState(null);
  const [grupoData, setGrupoData] = useState(null);
  const [showCriarEdicao, setShowCriarEdicao] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const isAuth = await base44.auth.isAuthenticated();
      if (!isAuth) {
        window.location.href = '/';
        return;
      }
      const me = await base44.auth.me();

      // Guard: apenas Base44 admins e M31 super_admin podem acessar esta tela
      if (me.role === 'admin') {
        setUser(me);
        loadData(me.church_id);
        return;
      }
      const membros = await base44.entities.EventoM31Membro.filter({
        user_email: me.email,
        ativo: true,
      });
      const membro = membros?.[0];
      if (membro?.perfil === 'super_admin') {
        setUser(me);
        loadData(me.church_id);
      } else {
        // Redirecionar para o portal, que direciona para a área correta do perfil
        window.location.href = '/portal';
      }
    } catch {
      window.location.href = '/';
    }
  }

  async function loadData(churchId) {
    try {
      const audit = await base44.functions.invoke('m31AuditarConversaoGrupo', {
        church_id: churchId,
      });
      setAuditoria(audit.data);

      const grupos = await base44.entities.M31GrupoMembro.filter(
        { church_id: churchId, status: 'ativa' },
        null,
        1000
      );
      setGrupoData({
        total_membros: grupos?.length || 0,
        ultima_deteccao: grupos?.[0]?.ultima_deteccao,
      });
    } catch (error) {
      console.error('Erro ao carregar dados', error);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await base44.auth.logout('/');
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: T.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: '32px', height: '32px', border: '3px solid #EAE7E2', borderTopColor: T.brand, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
      <AdminHeader user={user} onLogout={handleLogout} />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {auditoria && <MiniMetrics auditoria={auditoria} grupoData={grupoData} />}

        {/* Botão Nova Edição */}
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowCriarEdicao(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: T.brand, color: '#fff', border: 'none',
              borderRadius: '10px', padding: '10px 18px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(139,26,43,0.2)',
            }}
          >
            <CopyPlus size={16} /> Nova Edição
          </button>
        </div>

        <M31BentoDashboard />
      </div>

      {showCriarEdicao && (
        <M31CriarEdicaoModal
          onClose={() => setShowCriarEdicao(false)}
          onSuccess={() => { toast.success('Edição criada com sucesso!'); }}
          userEmail={user?.email}
        />
      )}
    </div>
  );
}