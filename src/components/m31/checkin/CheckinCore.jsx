import { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { CheckCircle, XCircle, AlertTriangle, Loader2, QrCode, Keyboard, ScanLine, Zap } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

const TIPO_LABELS = { publico_geral: 'Público Geral', voluntario: 'Voluntário', caravana: 'Caravana', doacao: 'Doação' };

/**
 * Núcleo do check-in — usado no painel admin e no dispositivo auxiliar.
 * Modos: leitor (campo focado p/ leitor USB/bipagem), camera (QR via câmera), codigo (digitação).
 * Modo fila rápida: sem pop-up de confirmação — flash rápido e segue para a próxima.
 */
export default function CheckinCore({ deviceToken = null }) {
  const [modo, setModo] = useState('leitor');
  const [codigo, setCodigo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [filaRapida, setFilaRapida] = useState(false);
  const [scannerAtivo, setScannerAtivo] = useState(false);
  const inputRef = useRef(null);
  const qrInstanceRef = useRef(null);
  const flashTimerRef = useRef(null);

  const fazerCheckin = useCallback(async (valor) => {
    const c = (valor || '').trim();
    if (!c) return;
    setLoading(true);
    const payload = { codigo_inscricao: c.toUpperCase() };
    if (deviceToken) payload.device_token = deviceToken;
    const res = await base44.functions.invoke('m31Checkin', payload);
    setLoading(false);
    const data = res.data || {};
    let novo;
    if (data.success) {
      novo = { tipo: 'ok', msg: data.inscricao?.mensagem || 'Check-in realizado!', inscricao: data.inscricao };
    } else if (data.aviso) {
      novo = { tipo: 'aviso', msg: data.inscricao?.mensagem || data.error, inscricao: data.inscricao };
    } else {
      novo = { tipo: 'erro', msg: data.error || 'Erro no check-in' };
    }
    setResultado(novo);
    setCodigo('');
    if (filaRapida) {
      // Fila rápida: flash breve e segue
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setResultado(null), 1800);
    }
    // Reforça o foco do leitor
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [deviceToken, filaRapida]);

  // ── Câmera ──
  const iniciarScanner = async () => {
    setScannerAtivo(true);
    setResultado(null);
    await new Promise(r => setTimeout(r, 200));
    try {
      const qr = new Html5Qrcode('qr-reader-core');
      qrInstanceRef.current = qr;
      await qr.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          if (filaRapida) {
            // Não para a câmera: pausa curtinha e continua lendo
            try { qr.pause(true); } catch { /* noop */ }
            await fazerCheckin(decodedText);
            setTimeout(() => { try { qr.resume(); } catch { /* noop */ } }, 1200);
          } else {
            await qr.stop();
            qrInstanceRef.current = null;
            setScannerAtivo(false);
            await fazerCheckin(decodedText);
          }
        },
        () => {}
      );
    } catch {
      setScannerAtivo(false);
    }
  };

  const pararScanner = async () => {
    if (qrInstanceRef.current) {
      try { await qrInstanceRef.current.stop(); } catch { /* noop */ }
      qrInstanceRef.current = null;
    }
    setScannerAtivo(false);
  };

  const alternarModo = async (novo) => {
    if (scannerAtivo) await pararScanner();
    setModo(novo);
    setResultado(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  useEffect(() => {
    return () => {
      if (qrInstanceRef.current) { try { qrInstanceRef.current.stop(); } catch { /* noop */ } }
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  // Mantém o foco no campo do leitor USB
  useEffect(() => {
    if (modo === 'leitor') {
      const t = setInterval(() => {
        if (document.activeElement?.id !== 'checkin-leitor-input') inputRef.current?.focus();
      }, 2000);
      return () => clearInterval(t);
    }
  }, [modo]);

  const modos = [
    { id: 'leitor', label: 'Leitor', icon: ScanLine },
    { id: 'camera', label: 'Câmera', icon: QrCode },
    { id: 'codigo', label: 'Código', icon: Keyboard },
  ];

  const resultCores = {
    ok:    { border: 'border-m31-success/40', text: 'text-m31-success', Icon: CheckCircle },
    aviso: { border: 'border-m31-warning/40', text: 'text-m31-warning', Icon: AlertTriangle },
    erro:  { border: 'border-m31-danger/40',  text: 'text-m31-danger',  Icon: XCircle },
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle modo + fila rápida */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-m31">
        <div className="flex gap-1 bg-muted rounded-lg p-1 mb-3">
          {modos.map(m => (
            <button
              key={m.id}
              onClick={() => alternarModo(m.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-all ${
                modo === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <m.icon size={14} /> {m.label}
            </button>
          ))}
        </div>

        {/* Modo fila rápida */}
        <button
          onClick={() => setFilaRapida(v => !v)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-md border transition-all ${
            filaRapida ? 'border-primary bg-accent' : 'border-border bg-card'
          }`}
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Zap size={14} className={filaRapida ? 'text-primary' : 'text-muted-foreground'} />
            Modo fila rápida
          </span>
          <span className={`text-micro font-bold px-2 py-0.5 rounded-full ${filaRapida ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {filaRapida ? 'LIGADO' : 'DESLIGADO'}
          </span>
        </button>
        {filaRapida && (
          <p className="text-micro text-muted-foreground mt-1.5 px-1">
            Sem pop-up de confirmação — flash rápido e leitura contínua para processar filas longas.
          </p>
        )}
      </div>

      {/* Área de leitura */}
      <div className="bg-card border border-border rounded-lg p-5 shadow-m31">
        {modo === 'leitor' && (
          <div
            onClick={() => inputRef.current?.focus()}
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          >
            <ScanLine size={36} className="mx-auto mb-2 text-primary" />
            <p className="text-title text-foreground">
              {loading ? 'Processando...' : 'Leitor ativo — bipe o ingresso'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              O leitor USB/Bluetooth envia o código automaticamente para este campo
            </p>
            <input
              id="checkin-leitor-input"
              ref={inputRef}
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') fazerCheckin(codigo); }}
              autoFocus
              className="mt-4 w-full max-w-xs mx-auto block h-10 text-center font-mono text-sm bg-background border border-input rounded-md px-3 outline-none focus:border-primary"
              placeholder="aguardando leitura..."
            />
          </div>
        )}

        {modo === 'camera' && (
          <div className="text-center">
            {!scannerAtivo && !loading && (
              <button
                onClick={iniciarScanner}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-6 py-3 text-sm font-medium hover:bg-m31-primary-dark transition-colors"
              >
                <QrCode size={16} /> Abrir Câmera
              </button>
            )}
            {loading && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-4 text-sm">
                <Loader2 size={16} className="animate-spin" /> Processando...
              </div>
            )}
            <div id="qr-reader-core" className={`rounded-lg overflow-hidden mt-3 ${scannerAtivo ? 'block' : 'hidden'}`} />
            {scannerAtivo && (
              <button onClick={pararScanner} className="mt-3 border border-border rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                Parar câmera
              </button>
            )}
          </div>
        )}

        {modo === 'codigo' && (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={codigo}
              onChange={e => setCodigo(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && fazerCheckin(codigo)}
              placeholder="M31-ABC123"
              autoFocus
              className="flex-1 h-11 text-center font-mono tracking-widest bg-background border border-input rounded-md px-4 outline-none focus:border-primary"
            />
            <button
              onClick={() => fazerCheckin(codigo)}
              disabled={loading || !codigo.trim()}
              className="w-11 h-11 bg-primary text-primary-foreground rounded-md flex items-center justify-center disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            </button>
          </div>
        )}
      </div>

      {/* Resultado */}
      {resultado && (() => {
        const cfg = resultCores[resultado.tipo];
        const Icon = cfg.Icon;
        // Fila rápida: flash compacto
        if (filaRapida) {
          return (
            <div className={`bg-card border-2 ${cfg.border} rounded-lg px-4 py-3 flex items-center gap-3 shadow-m31`}>
              <Icon size={22} className={cfg.text} />
              <div className="min-w-0">
                <p className={`text-title truncate ${cfg.text}`}>{resultado.inscricao?.nome || resultado.msg}</p>
                {resultado.inscricao?.nome && <p className="text-micro text-muted-foreground">{resultado.msg}</p>}
              </div>
            </div>
          );
        }
        // Padrão: card completo
        return (
          <div className={`bg-card border-2 ${cfg.border} rounded-lg p-5 text-center shadow-m31`}>
            <Icon size={44} className={`mx-auto mb-2 ${cfg.text}`} />
            <p className={`text-title mb-3 ${cfg.text}`}>{resultado.msg}</p>
            {resultado.inscricao && (
              <div className="bg-muted rounded-md p-4 text-left">
                {[
                  resultado.inscricao.ordem_operacional != null ? { l: 'Nº interno', v: `#${String(resultado.inscricao.ordem_operacional).padStart(3, '0')}` } : null,
                  { l: 'Nome', v: resultado.inscricao.nome },
                  resultado.inscricao.tipo ? { l: 'Tipo', v: TIPO_LABELS[resultado.inscricao.tipo] || resultado.inscricao.tipo } : null,
                  { l: 'Código', v: resultado.inscricao.codigo_inscricao },
                  resultado.inscricao.caravana_nome ? { l: 'Caravana', v: resultado.inscricao.caravana_nome } : null,
                ].filter(Boolean).map(item => (
                  <div key={item.l} className="flex justify-between py-1.5 border-b border-border last:border-b-0">
                    <span className="text-sm text-muted-foreground">{item.l}</span>
                    <span className="text-sm font-medium text-foreground">{item.v}</span>
                  </div>
                ))}
              </div>
            )}
            {modo === 'camera' && (
              <button
                onClick={iniciarScanner}
                className="mt-4 inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-5 py-2.5 text-sm font-medium"
              >
                <QrCode size={14} /> Escanear próxima
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}