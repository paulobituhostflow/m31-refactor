import { useState, useMemo } from 'react';
import { C, isConfirmado, isPendente } from './CaravanasUtils';

const exportToCSV = (data, filename) => {
  const headers = [
    'Nome',
    'WhatsApp',
    'E-mail',
    'Status Pagamento',
    'Status Inscrição',
    'Tipo Inscrição',
    'Caravana',
    'Líder Caravana',
    'Cidade',
    'Valor Pago',
    'Data Cadastro',
    'Data Pagamento',
    'No Grupo WhatsApp',
    'Código Inscrição',
  ];

  const rows = data.map(item => [
    `"${(item.nome || '').replace(/"/g, '""')}"`,
    `"${(item.whatsapp || '').replace(/"/g, '""')}"`,
    `"${(item.email || '').replace(/"/g, '""')}"`,
    item.status_pagamento || '',
    item.tipo || '',
    item.tipo || '',
    `"${(item.caravana_nome || '').replace(/"/g, '""')}"`,
    `"${(item.caravana_lider || '').replace(/"/g, '""')}"`,
    `"${(item.cidade || '').replace(/"/g, '""')}"`,
    item.valor_pago || '',
    item.created_date ? new Date(item.created_date).toLocaleDateString('pt-BR') : '',
    item.data_pagamento ? new Date(item.data_pagamento).toLocaleDateString('pt-BR') : '',
    item.whatsapp && item.whatsapp.trim() ? 'Sim' : 'Não',
    item.codigo_inscricao || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const exportToXLSX = async (data, filename) => {
  try {
    // Tenta importar a lib XLSX dinamicamente
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.min.js').then(m => m.default || m);
    
    const headers = [
      'Nome',
      'WhatsApp',
      'E-mail',
      'Status Pagamento',
      'Status Inscrição',
      'Tipo Inscrição',
      'Caravana',
      'Líder Caravana',
      'Cidade',
      'Valor Pago',
      'Data Cadastro',
      'Data Pagamento',
      'No Grupo WhatsApp',
      'Código Inscrição',
    ];

    const rows = data.map(item => [
      item.nome || '',
      item.whatsapp || '',
      item.email || '',
      item.status_pagamento || '',
      item.tipo || '',
      item.tipo || '',
      item.caravana_nome || '',
      item.caravana_lider || '',
      item.cidade || '',
      item.valor_pago || '',
      item.created_date ? new Date(item.created_date).toLocaleDateString('pt-BR') : '',
      item.data_pagamento ? new Date(item.data_pagamento).toLocaleDateString('pt-BR') : '',
      item.whatsapp && item.whatsapp.trim() ? 'Sim' : 'Não',
      item.codigo_inscricao || '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 16 },
      { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 18 },
      { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
      { wch: 16 }, { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inscritas');
    XLSX.writeFile(wb, filename);
  } catch (error) {
    console.error('Erro ao exportar XLSX:', error);
    alert('XLSX não disponível. Use CSV ou tente novamente.');
  }
};

export default function CaravanaExportModal({ caravana, membros, onClose }) {
  const [filtro, setFiltro] = useState('todas');
  const [formato, setFormato] = useState('csv');
  const [exporting, setExporting] = useState(false);

  const confirmados = membros.filter(isConfirmado).length;
  const pendentes = membros.filter(isPendente).length;
  const semTel = membros.filter(m => !m.whatsapp || !m.whatsapp.trim()).length;
  const semGrupo = membros.filter(m => !m.data_envio_boas_vindas).length;

  const filtrados = useMemo(() => {
    let result = membros;
    
    if (filtro === 'confirmadas') result = result.filter(isConfirmado);
    else if (filtro === 'pendentes') result = result.filter(isPendente);
    else if (filtro === 'sem_tel') result = result.filter(m => !m.whatsapp || !m.whatsapp.trim());
    else if (filtro === 'sem_grupo') result = result.filter(m => !m.data_envio_boas_vindas);
    
    return result;
  }, [membros, filtro]);

  const handleExport = async () => {
    const slug = caravana.slug?.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'caravana';
    const data = filtrados.map(m => ({
      nome: m.nome,
      whatsapp: m.whatsapp,
      email: m.email,
      status_pagamento: m.status_pagamento,
      tipo: m.tipo,
      caravana_nome: caravana.nome,
      caravana_lider: caravana.lider_nome,
      cidade: m.cidade,
      valor_pago: m.valor_pago,
      created_date: m.created_date,
      data_pagamento: m.data_pagamento,
      codigo_inscricao: m.codigo_inscricao,
      data_envio_boas_vindas: m.data_envio_boas_vindas,
    }));

    const timestamp = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    const filename = `${slug}-inscritas-m31-${timestamp}.${formato}`;

    setExporting(true);
    try {
      if (formato === 'csv') {
        exportToCSV(data, filename);
      } else {
        await exportToXLSX(data, filename);
      }
    } finally {
      setExporting(false);
      onClose();
    }
  };

  const filtros = [
    { id: 'todas', label: `Todas · ${membros.length}`, count: membros.length },
    { id: 'confirmadas', label: `Confirmadas · ${confirmados}`, count: confirmados },
    { id: 'pendentes', label: `Pendentes · ${pendentes}`, count: pendentes },
    { id: 'sem_tel', label: `Sem tel · ${semTel}`, count: semTel },
    { id: 'sem_grupo', label: `Sem grupo · ${semGrupo}`, count: semGrupo },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', animation: 'fadeIn .15s',
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95) } to { opacity: 1; transform: scale(1) } }
      `}</style>

      <div style={{
        background: C.bg2, border: `1px solid ${C.borderSt}`,
        borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '380px',
      }}>
        {/* HEADER */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '4px' }}>
            Exportar inscritas
          </div>
          <div style={{ fontSize: '12px', color: C.textTer }}>
            {caravana.nome}
          </div>
        </div>

        {/* FILTRO SECTION */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: C.textSec, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Filtro
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filtros.map(f => (
              <label key={f.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', background: filtro === f.id ? `rgba(139, 26, 43,0.15)` : C.bg3,
                border: `1.5px solid ${filtro === f.id ? 'rgba(139, 26, 43,0.35)' : C.border}`,
                borderRadius: '8px', cursor: 'pointer', transition: 'all .15s',
              }}>
                <input type="radio" checked={filtro === f.id} onChange={() => setFiltro(f.id)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <span style={{ fontSize: '13px', fontWeight: '500', color: C.text }}>
                  {f.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* FORMATO SECTION */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: '700', color: C.textSec, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Formato
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[
              { id: 'csv', label: 'CSV', icon: '📄' },
              { id: 'xlsx', label: 'XLSX', icon: '📊' },
            ].map(f => (
              <button key={f.id} onClick={() => setFormato(f.id)} style={{
                flex: 1, padding: '10px 12px',
                background: formato === f.id ? C.brand : C.bg3,
                border: `1.5px solid ${formato === f.id ? C.brand : C.border}`,
                borderRadius: '8px', color: formato === f.id ? '#fff' : C.text,
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                fontFamily: 'Inter,sans-serif', transition: 'all .15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              }}>
                <span>{f.icon}</span> {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* INFO */}
        <div style={{
          background: C.bg3, border: `1px solid ${C.border}`,
          borderRadius: '8px', padding: '10px 12px', marginBottom: '20px',
          fontSize: '11px', color: C.textTer, lineHeight: 1.5,
        }}>
          Será exportado <strong>{filtrados.length}</strong> registro{filtrados.length !== 1 ? 's' : ''} com todos os dados.
        </div>

        {/* BUTTONS */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} disabled={exporting} style={{
            flex: 1, padding: '11px', background: 'none', border: `1px solid ${C.border}`,
            borderRadius: '7px', color: C.textSec, fontSize: '13px', fontWeight: '600',
            cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif',
            opacity: exporting ? 0.5 : 1, transition: 'all .15s',
          }}>
            Cancelar
          </button>
          <button onClick={handleExport} disabled={exporting || filtrados.length === 0} style={{
            flex: 1, padding: '11px', background: C.brand, border: 'none',
            borderRadius: '7px', color: '#fff', fontSize: '13px', fontWeight: '600',
            cursor: exporting ? 'not-allowed' : 'pointer', fontFamily: 'Inter,sans-serif',
            opacity: exporting || filtrados.length === 0 ? 0.5 : 1, transition: 'all .15s',
          }}>
            {exporting ? '⏳ Exportando...' : '📥 Exportar'}
          </button>
        </div>
      </div>
    </div>
  );
}