import { useState } from 'react';
import { ScanLine, ListChecks, Smartphone } from 'lucide-react';
import CheckinCore from '@/components/m31/checkin/CheckinCore';
import CheckinListaParticipantes from '@/components/m31/checkin/CheckinListaParticipantes';
import CheckinDispositivos from '@/components/m31/checkin/CheckinDispositivos';

const ABAS = [
  { id: 'operacao', label: 'Check-in', icon: ScanLine },
  { id: 'lista', label: 'Lista', icon: ListChecks },
  { id: 'dispositivos', label: 'Dispositivos', icon: Smartphone },
];

/**
 * Painel de check-in do dia do evento:
 * - Check-in: leitor USB (campo focado), câmera QR, código manual + modo fila rápida
 * - Lista: progresso, busca e opção de ocultar quem já fez check-in
 * - Dispositivos: autorização de dispositivos auxiliares via QR + PIN
 */
export default function M31CheckinPanel() {
  const [aba, setAba] = useState('operacao');

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-4">
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-all ${
              aba === a.id ? 'bg-card text-primary shadow-m31-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <a.icon size={14} /> {a.label}
          </button>
        ))}
      </div>

      {aba === 'operacao' && <CheckinCore />}
      {aba === 'lista' && <CheckinListaParticipantes />}
      {aba === 'dispositivos' && <CheckinDispositivos />}
    </div>
  );
}