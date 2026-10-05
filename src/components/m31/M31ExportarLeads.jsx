import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const C = {
  bg0: '#0a0a0c', bg1: '#111114', bg2: '#17171b', bg3: '#1e1e23', bg4: '#26262c',
  text: '#ededee', textSec: '#8a8a93', textTer: '#56565e',
  border: 'rgba(255,255,255,0.06)',
  brand: '#8B1A2B', brandSoft: 'rgba(139, 26, 43,0.1)', brandBorder: 'rgba(139, 26, 43,0.3)',
  success: '#10b981', successSoft: 'rgba(16,185,129,0.1)',
  warning: '#f59e0b', warningSoft: 'rgba(245,158,11,0.1)',
  whatsapp: '#25d366',
};

function normalizarTelefone(tel) {
  if (!tel) return '';
  let t = tel.replace(/[\s().\-+]/g, '');
  if (!t.startsWith('55')) t = '55' + t;
  return t;
}

const STATUS_LABEL = {
  pendente: 'Aguardando pagamento',
  checkout_abandonado: 'Checkout abandonado',
  checkout_pendente: 'Link enviado',
};

export default function M31ExportarLeads() {
  const [exportando, setExportando] = useState(false);

  const { data: lotes = [] } = useQuery({
    queryKey: ['m31lotes_export'],
    queryFn: () => base44.entities.EventoM31Lote.list(),
  });

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['m31leads_pendentes_export'],
    queryFn: async () => {
      const insc = await base44.entities.EventoM31Inscricao.filter(
        { status_pagamento: { $in: ['pendente', 'checkout_abandonado', 'checkout_pendente'] } },
        'created_date',
        500
      );
      const loteMap = Object.fromEntries(lotes.map(l => [l.codigo, l.valor]));
      return insc.map(i => ({
        ...i,
        valor_pago: i.valor_pago > 0 ? i.valor_pago : (loteMap[i.lote] || ''),
      })).sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    },
    enabled: lotes.length > 0,
  });

  function exportarCSV() {
    setExportando(true);
    const header = ['Nome', 'Status', 'Valor (R$)', 'Lote', 'Tipo', 'Telefone Normalizado', 'Link WhatsApp', 'Email', 'Caravana', 'Data Cadastro'];
    const rows = leads.map(l => {
      const tel = normalizarTelefone(l.whatsapp);
      const waLink = tel ? `https://wa.me/${tel}` : '';
      const data = new Date(l.created_date).toLocaleDateString('pt-BR', { timeZone: 'America/Recife' });
      return [
        l.nome || '',
        STATUS_LABEL[l.status_pagamento] || l.status_pagamento,
        l.valor_pago || '',
        l.lote?.replace('_', ' ') || '',
        l.tipo || '',
        tel,
        waLink,
        l.email || '',
        l.caravana_nome || '',
        data,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv = '\uFEFF' + [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-pendentes-m31-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportando(false);
  }

  // Estatísticas rápidas
  const stats = {
    total: leads.length,
    pendente: leads.filter(l => l.status_pagamento === 'pendente').length,
    abandonado: leads.filter(l => l.status_pagamento === 'checkout_abandonado').length,
    checkout_pendente: leads.filter(l => l.status_pagamento === 'checkout_pendente').length,
    comTelefone: leads.filter(l => l.whatsapp).length,
  };

  return (
    <div style={{ fontFamily: 'Inter,sans-serif', color: C.text, maxWidth: '600px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: C.text, marginBottom: '6px' }}>Exportar Leads Pendentes</h2>
        <p style={{ fontSize: '13px', color: C.textSec, lineHeight: '1.5' }}>
          Exporta todos os leads com pagamento pendente em formato CSV, com links diretos para WhatsApp normalizados.
        </p>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '24px', background: C.bg2, borderRadius: '12px', border: `1px solid ${C.border}`, marginBottom: '16px' }}>
          <div style={{ width: '20px', height: '20px', border: `2px solid ${C.border}`, borderTopColor: C.brand, borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
          <span style={{ fontSize: '14px', color: C.textSec }}>Carregando leads…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '20px' }}>
          {[
            { label: 'Total de leads', value: stats.total, color: C.text },
            { label: 'Com telefone', value: stats.comTelefone, color: C.whatsapp },
            { label: 'Aguardando pagamento', value: stats.pendente, color: C.warning },
            { label: 'Checkout abandonado', value: stats.abandonado, color: '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: C.textTer, marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Descrição das colunas */}
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: C.textTer, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>Colunas do arquivo CSV</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            ['Nome', 'Nome completo da inscrita'],
            ['Status', 'Situação do pagamento'],
            ['Valor (R$)', 'Valor do lote'],
            ['Lote / Tipo', 'Lote e tipo de inscrição'],
            ['Telefone Normalizado', 'Ex: 5581999999999 (sem +, espaços ou hífen)'],
            ['Link WhatsApp', 'https://wa.me/55xxxxxxxxxx — clicável no Excel/Sheets'],
            ['Email', 'E-mail cadastrado'],
            ['Caravana', 'Nome da caravana (se houver)'],
            ['Data Cadastro', 'Data de entrada no sistema'],
          ].map(([col, desc]) => (
            <div key={col} style={{ display: 'flex', gap: '10px', fontSize: '13px' }}>
              <span style={{ fontWeight: '600', color: C.brand, minWidth: '160px', flexShrink: 0 }}>{col}</span>
              <span style={{ color: C.textSec }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Botão exportar */}
      <button
        onClick={exportarCSV}
        disabled={isLoading || exportando || leads.length === 0}
        style={{
          width: '100%', padding: '16px', background: leads.length > 0 ? C.brand : C.bg3,
          border: 'none', borderRadius: '12px', color: '#fff', fontSize: '15px', fontWeight: '700',
          cursor: leads.length > 0 ? 'pointer' : 'not-allowed', fontFamily: 'Inter,sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          opacity: (isLoading || exportando) ? 0.7 : 1,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {exportando ? 'Gerando arquivo…' : isLoading ? 'Carregando…' : `Baixar CSV (${stats.total} leads)`}
      </button>

      <p style={{ fontSize: '11px', color: C.textTer, textAlign: 'center', marginTop: '10px' }}>
        Arquivo compatível com Excel e Google Sheets · Encoding UTF-8 com BOM
      </p>
    </div>
  );
}