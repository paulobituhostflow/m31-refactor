import { useState } from 'react';
import { ArrowLeft, RefreshCw, Send, AlertTriangle, CheckCircle, Clock, Download, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

export default function M31AuditoriaGapQR() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(null);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data: json } = await base44.functions.invoke('m31AuditarGapQR', {});
      setData(json);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  const reenviarQR = async (inscricao_id, nome) => {
    setEnviando(inscricao_id);
    try {
      await base44.functions.invoke('m31ReenviarQRCode', { inscricao_id });
      alert(`✅ QR enviado para ${nome}`);
      carregar();
    } catch (e) {
      alert(`❌ Erro: ${e.message}`);
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-h1 text-foreground">Auditoria — Gap de QR Code</h1>
            <p className="text-sm text-muted-foreground">
              Inscritas que receberam boas-vindas mas nunca receberam o QR Code de check-in
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={carregar}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-md font-medium text-body hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Auditando...' : 'Executar auditoria'}
          </button>
        </div>

        {erro && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{erro}</p>
          </div>
        )}

        {data && (
          <>
            {/* Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-lg p-5">
                <p className="text-caption text-muted-foreground mb-1">Total de casos</p>
                <p className="text-display text-foreground">{data.resumo.total_casos}</p>
              </div>
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-5">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  <p className="text-caption text-destructive">Respondeu mas sem QR</p>
                </div>
                <p className="text-display text-destructive">{data.resumo.responderam_mas_sem_qr}</p>
                <p className="text-xs text-muted-foreground mt-1">Webhook não entregou a resposta</p>
              </div>
              <div className="bg-accent/50 border border-border rounded-lg p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <p className="text-caption text-muted-foreground">Não respondeu</p>
                </div>
                <p className="text-display text-foreground">{data.resumo.nao_responderam_sem_qr}</p>
                <p className="text-xs text-muted-foreground mt-1">Aguarda resposta ou reenvio</p>
              </div>
            </div>

            {/* Casos críticos: respondeu mas sem QR */}
            {data.casos_responderam_sem_qr.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive" />
                  <h2 className="text-h2 text-foreground">
                    Crítico — Respondeu mas não recebeu QR ({data.casos_responderam_sem_qr.length})
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {data.acao_recomendada.responderam_sem_qr}
                </p>
                <div className="space-y-2">
                  {data.casos_responderam_sem_qr.map((c) => (
                    <Casocard key={c.inscricao_id} caso={c} onReenviar={reenviarQR} enviando={enviando === c.inscricao_id} critico />
                  ))}
                </div>
              </div>
            )}

            {/* Casos: não respondeu */}
            {data.casos_nao_responderam_sem_qr.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <h2 className="text-h2 text-foreground">
                    Aguardando — Não respondeu ({data.casos_nao_responderam_sem_qr.length})
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {data.acao_recomendada.nao_responderam_sem_qr}
                </p>
                <div className="space-y-2">
                  {data.casos_nao_responderam_sem_qr.map((c) => (
                    <Casocard key={c.inscricao_id} caso={c} onReenviar={reenviarQR} enviando={enviando === c.inscricao_id} />
                  ))}
                </div>
              </div>
            )}

            {data.resumo.total_casos === 0 && (
              <div className="bg-card border border-border rounded-lg p-8 text-center">
                <CheckCircle className="w-12 h-12 text-primary mx-auto mb-3" />
                <p className="text-body text-foreground font-medium">Nenhum gap encontrado!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Todas as inscrições aprovadas com boas-vindas enviadas também receberam o QR Code.
                </p>
              </div>
            )}
          </>
        )}

        {!data && !loading && !erro && (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Clique em "Executar auditoria" para identificar inscritas que receberam boas-vindas mas não o QR Code.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Casocard({ caso, onReenviar, enviando, critico }) {
  const dataBv = caso.data_envio_boas_vindas ? new Date(caso.data_envio_boas_vindas).toLocaleString('pt-BR') : '—';
  const [copiado, setCopiado] = useState(false);

  const qrUrl = caso.codigo_inscricao
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(caso.codigo_inscricao)}&bgcolor=FFFFFF&color=000000&format=png`
    : null;

  const baixarQR = async () => {
    if (!qrUrl) return;
    try {
      const res = await fetch(qrUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR_${caso.nome?.replace(/\s+/g, '_') || caso.inscricao_id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      window.open(qrUrl, '_blank');
    }
  };

  const copiarMensagem = async () => {
    const primeiroNome = caso.nome?.split(' ')[0] || 'Querida';
    const texto =
      `Olá, ${primeiroNome}! 🌸\n` +
      `Sua inscrição no M31 Filhas está confirmada!\n\n` +
      `🎟️ Código da sua inscrição: ${caso.codigo_inscricao || '(não gerado)'}\n\n` +
      `📲 Seu QR Code está na imagem anexa.\n` +
      `Apresente-o no credenciamento do evento.\n\n` +
      `Nos vemos no M31! 💛`;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {
      prompt('Copie a mensagem:', texto);
    }
  };

  return (
    <div className={`bg-card border rounded-lg p-4 ${critico ? 'border-destructive/30' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-body font-medium text-foreground">{caso.nome}</p>
            {critico && (
              <span className="text-xs px-2 py-0.5 bg-destructive/10 text-destructive rounded-pill font-medium">
                CRÍTICO
              </span>
            )}
            {caso.tem_qr_token ? (
              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-pill">QR gerado</span>
            ) : (
              <span className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded-pill">Sem QR token</span>
            )}
            {caso.status_envio_grupo === 'enviado' && (
              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-pill">Grupo enviado</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
            <p>📱 {caso.whatsapp} · 🎟️ {caso.codigo_inscricao}</p>
            <p>💬 Boas-vindas enviadas: {dataBv}</p>
            {caso.ultimo_atendimento && (
              <p>↩️ Última resposta: {new Date(caso.ultimo_atendimento).toLocaleString('pt-BR')}</p>
            )}
            <p>📊 Status QR: {caso.qr_envio_status} · Tentativas log: {caso.tentativas_log_qr}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={() => onReenviar(caso.inscricao_id, caso.nome)}
            disabled={enviando}
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Send className="w-3.5 h-3.5" />
            {enviando ? 'Enviando...' : 'Reenviar QR'}
          </button>
          {qrUrl && (
            <button
              onClick={baixarQR}
              className="inline-flex items-center gap-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar QR
            </button>
          )}
          <button
            onClick={copiarMensagem}
            className="inline-flex items-center gap-2 px-3 py-2 bg-accent text-accent-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            {copiado ? <CheckCircle className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiado ? 'Copiado!' : 'Copiar msg'}
          </button>
        </div>
      </div>
    </div>
  );
}