import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { KeyRound, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import CheckinCore from '@/components/m31/checkin/CheckinCore';

/**
 * Página do dispositivo auxiliar de check-in.
 * O voluntário chega via QR (/checkin-dispositivo?token=...), digita o PIN
 * e passa a operar o check-in com a autorização do dispositivo.
 */
export default function M31CheckinDevice() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [pin, setPin] = useState('');
  const [validando, setValidando] = useState(false);
  const [erro, setErro] = useState(null);
  const [autorizado, setAutorizado] = useState(false);
  const [nomeDispositivo, setNomeDispositivo] = useState('');

  // Sessão persistida no dispositivo
  useEffect(() => {
    if (token && localStorage.getItem('m31_checkin_device') === token) {
      setAutorizado(true);
      setNomeDispositivo(localStorage.getItem('m31_checkin_device_nome') || '');
    }
  }, [token]);

  const validar = async () => {
    if (!pin.trim()) return;
    setValidando(true);
    setErro(null);
    const res = await base44.functions.invoke('m31DispositivoCheckin', { action: 'validar', token, pin: pin.trim() });
    setValidando(false);
    if (res.data?.success) {
      localStorage.setItem('m31_checkin_device', token);
      localStorage.setItem('m31_checkin_device_nome', res.data.nome || '');
      setNomeDispositivo(res.data.nome || '');
      setAutorizado(true);
    } else {
      setErro(res.data?.error || 'Falha na validação');
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto pt-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-h1 text-primary">M31 — Check-in</h1>
          <p className="text-sm text-muted-foreground">
            {autorizado ? `Dispositivo autorizado${nomeDispositivo ? `: ${nomeDispositivo}` : ''}` : 'Dispositivo auxiliar'}
          </p>
        </div>

        {!token ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center shadow-m31">
            <XCircle size={40} className="mx-auto mb-3 text-m31-danger" />
            <p className="text-title text-foreground">Link inválido</p>
            <p className="text-sm text-muted-foreground mt-1">Escaneie o QR de autorização fornecido pelo gestor.</p>
          </div>
        ) : !autorizado ? (
          <div className="bg-card border border-border rounded-lg p-6 shadow-m31">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-3">
                <KeyRound size={20} className="text-primary" />
              </div>
              <p className="text-title text-foreground">Digite o PIN de ativação</p>
              <p className="text-sm text-muted-foreground mt-1">O gestor informa o PIN de 6 dígitos pessoalmente</p>
            </div>
            <input
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && validar()}
              inputMode="numeric"
              placeholder="000000"
              autoFocus
              className="w-full h-14 text-center font-mono text-h1 tracking-[0.4em] bg-background border border-input rounded-lg outline-none focus:border-primary"
            />
            {erro && <p className="text-sm text-m31-danger text-center mt-3">{erro}</p>}
            <button
              onClick={validar}
              disabled={pin.length !== 6 || validando}
              className="w-full mt-4 h-12 bg-primary text-primary-foreground rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {validando ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Ativar dispositivo
            </button>
          </div>
        ) : (
          <CheckinCore deviceToken={token} />
        )}
      </div>
    </div>
  );
}