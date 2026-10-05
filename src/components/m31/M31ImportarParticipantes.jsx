import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, FileSpreadsheet, CheckCircle, Users, AlertCircle, Loader2, Download } from 'lucide-react';

const C = {
  bg: '#FFFFFF', border: '#E5E7EB',
  text: '#1A1A1A', muted: '#6B7280',
  subtle: '#9CA3AF', input: '#FFFFFF', inputBorder: '#D1D5DB',
  primary: '#7A1F2B', primaryHover: '#6B1A25',
};

const btn = (cor) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  height: '40px', padding: '0 20px', border: 'none', borderRadius: '6px',
  backgroundColor: cor || C.primary, color: '#fff',
  fontSize: '14px', fontFamily: 'Inter, sans-serif', fontWeight: '500', cursor: 'pointer',
});

export default function M31ImportarParticipantes() {
  const [file, setFile] = useState(null);
  const [fase, setFase] = useState('idle'); // idle | uploading | preview | importing | done | error
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (f) setFile(f);
  };

  const analisar = async () => {
    if (!file) return;
    setFase('uploading');
    setErro('');
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFase('uploading');
    const res = await base44.functions.invoke('m31ImportarParticipantes', { file_url, dry_run: true });
    if (res.data?.error) { setErro(res.data.error); setFase('error'); return; }
    setPreview({ ...res.data, file_url });
    setFase('preview');
  };

  const importar = async () => {
    if (!preview?.file_url) return;
    setFase('importing');
    const res = await base44.functions.invoke('m31ImportarParticipantes', { file_url: preview.file_url, dry_run: false });
    if (res.data?.error) { setErro(res.data.error); setFase('error'); return; }
    setResultado(res.data);
    setFase('done');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '820px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: '600', color: C.text, margin: 0 }}>
          Importar Participantes
        </h2>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: C.muted, marginTop: '4px' }}>
          Importe a lista do sistema anterior. Confirmados receberão código de check-in. Leads serão cadastrados para recuperação via bot.
        </p>
      </div>

      {/* Legenda */}
      <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: '600', color: C.muted, marginBottom: '4px' }}>O que será feito:</div>
        {[
          { icon: CheckCircle, color: '#34D399', text: 'Status "Confirmado" → importado como aprovado + código QR de check-in gerado automaticamente' },
          { icon: Users, color: '#F59E0B', text: 'Status "Inscrito" (não confirmado) → importado como lead para recuperação via bot/email' },
          { icon: AlertCircle, color: C.subtle, text: 'E-mails já cadastrados no sistema serão ignorados (sem duplicatas)' },
        ].map(({ icon: Icon, color, text }) => (
          <div key={text} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Icon size={15} color={color} style={{ marginTop: '1px', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: C.muted }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Upload */}
      {fase === 'idle' && (
        <div style={{ backgroundColor: C.bg, border: `2px dashed ${C.inputBorder}`, borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
          <FileSpreadsheet size={36} color={C.subtle} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: C.muted, marginBottom: '16px' }}>
            Selecione o arquivo Excel exportado do sistema anterior
          </div>
          <label style={{ ...btn(), cursor: 'pointer' }}>
            <Upload size={16} /> Selecionar arquivo .xlsx
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} style={{ display: 'none' }} />
          </label>
          {file && (
            <div style={{ marginTop: '16px', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: '#34D399' }}>
              {file.name} selecionado
            </div>
          )}
          {file && (
            <button onClick={analisar} style={{ ...btn(), marginTop: '12px', margin: '12px auto 0' }}>
              Analisar arquivo
            </button>
          )}
        </div>
      )}

      {/* Carregando */}
      {(fase === 'uploading' || fase === 'importing') && (
        <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
          <Loader2 size={32} color="#5B1E2D" style={{ margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: C.muted }}>
            {fase === 'uploading' ? 'Analisando arquivo...' : 'Importando participantes...'}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Preview */}
      {fase === 'preview' && preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { label: 'Confirmados', value: preview.confirmados, color: '#34D399', sub: 'Receberão código QR' },
              { label: 'Leads', value: preview.leads, color: '#F59E0B', sub: 'Recuperação via bot' },
              { label: 'Ignorados', value: preview.ignorados, color: C.subtle, sub: 'Sem email ou duplicados' },
            ].map(item => (
              <div key={item.label} style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: C.muted, marginBottom: '6px' }}>{item.label}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '28px', fontWeight: '700', color: item.color }}>{item.value}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: C.subtle, marginTop: '4px' }}>{item.sub}</div>
              </div>
            ))}
          </div>

          {preview.preview_confirmados?.length > 0 && (
            <div style={{ backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: '600', color: C.muted }}>
                Prévia — Confirmados
              </div>
              {preview.preview_confirmados.map((p, i) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: i < preview.preview_confirmados.length - 1 ? `1px solid rgba(0,0,0,0.06)` : 'none' }}>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', fontWeight: '500', color: C.text }}>{p.nome}</div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: C.muted }}>{p.email} · Código: <span style={{ color: '#34D399', fontFamily: 'monospace' }}>{p.codigo_inscricao}</span></div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => { setFase('idle'); setFile(null); setPreview(null); }} style={{
              ...btn('transparent'), border: `1px solid ${C.inputBorder}`, color: C.muted,
            }}>Cancelar</button>
            <button onClick={importar} style={{ ...btn(), flex: 1 }}>
              <Download size={16} /> Confirmar Importação ({preview.confirmados + preview.leads} participantes)
            </button>
          </div>
        </div>
      )}

      {/* Sucesso */}
      {fase === 'done' && resultado && (
        <div style={{ backgroundColor: C.bg, border: '1px solid rgba(52,211,153,0.30)', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
          <CheckCircle size={40} color="#34D399" style={{ margin: '0 auto 12px' }} />
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '18px', fontWeight: '600', color: '#34D399', marginBottom: '8px' }}>
            Importação concluída!
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: C.muted, marginBottom: '20px' }}>
            {resultado.message}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Confirmados importados', value: resultado.importados_confirmados, color: '#34D399' },
              { label: 'Leads importados', value: resultado.importados_leads, color: '#F59E0B' },
            ].map(item => (
              <div key={item.label} style={{ backgroundColor: '#F8F8F9', borderRadius: '6px', padding: '14px' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: C.muted }}>{item.label}</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '24px', fontWeight: '700', color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
          <button onClick={() => { setFase('idle'); setFile(null); setPreview(null); setResultado(null); }} style={{ ...btn('#F8F8F9'), color: C.muted }}>
            Nova importação
          </button>
        </div>
      )}

      {/* Erro */}
      {fase === 'error' && (
        <div style={{ backgroundColor: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.30)', borderRadius: '12px', padding: '20px', display: 'flex', gap: '12px' }}>
          <AlertCircle size={18} color="#F87171" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '500', color: '#F87171', marginBottom: '4px' }}>Erro na importação</div>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: C.muted }}>{erro}</div>
            <button onClick={() => setFase('idle')} style={{ ...btn(), marginTop: '12px', fontSize: '13px', height: '34px' }}>Tentar novamente</button>
          </div>
        </div>
      )}
    </div>
  );
}