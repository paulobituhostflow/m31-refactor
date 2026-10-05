import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Smartphone, Plus, Ban, Loader2, KeyRound } from 'lucide-react';

const STATUS_CFG = {
  pendente: { label: 'Aguardando PIN', cls: 'bg-amber-100 text-amber-800' },
  ativo:    { label: 'Ativo',          cls: 'bg-m31-success/10 text-m31-success' },
  revogado: { label: 'Revogado',       cls: 'bg-m31-danger/10 text-m31-danger' },
};

function deviceUrl(token) {
  return `${window.location.origin}/checkin-dispositivo?token=${token}`;
}

function qrUrl(token) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(deviceUrl(token))}`;
}

/**
 * Autorização de dispositivos auxiliares de check-in via QR + PIN.
 * O gestor gera um QR; o voluntário escaneia, digita o PIN e passa a fazer check-in.
 */
export default function CheckinDispositivos() {
  const [nome, setNome] = useState('');
  const [novoDispositivo, setNovoDispositivo] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['checkin_dispositivos'],
    queryFn: async () => {
      const res = await base44.functions.invoke('m31DispositivoCheckin', { action: 'listar' });
      return res.data?.dispositivos || [];
    },
    refetchInterval: 15000,
  });

  const gerar = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('m31DispositivoCheckin', { action: 'gerar', nome: nome.trim() });
      return res.data;
    },
    onSuccess: (d) => {
      if (d?.success) {
        setNovoDispositivo(d);
        setNome('');
        queryClient.invalidateQueries({ queryKey: ['checkin_dispositivos'] });
      }
    },
  });

  const revogar = useMutation({
    mutationFn: async (id) => base44.functions.invoke('m31DispositivoCheckin', { action: 'revogar', id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['checkin_dispositivos'] }),
  });

  const exibido = novoDispositivo || data?.find(d => d.status === 'pendente' && d.token);

  return (
    <div className="flex flex-col gap-4">
      {/* Gerar novo */}
      <div className="bg-card border border-border rounded-lg p-4 shadow-m31">
        <p className="text-caption text-muted-foreground mb-2">Autorizar novo dispositivo</p>
        <div className="flex gap-2">
          <input
            value={nome}
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && nome.trim() && gerar.mutate()}
            placeholder="Ex: Tablet Portão 2 — Maria"
            className="flex-1 h-10 px-3 bg-background border border-input rounded-md text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => gerar.mutate()}
            disabled={!nome.trim() || gerar.isPending}
            className="flex items-center gap-1.5 px-4 h-10 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50"
          >
            {gerar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Gerar QR + PIN
          </button>
        </div>
        <p className="text-micro text-muted-foreground mt-2">
          O voluntário escaneia o QR com o celular/tablet, digita o PIN e o dispositivo fica autorizado por 48h.
        </p>
      </div>

      {/* QR + PIN gerado */}
      {exibido && (
        <div className="bg-card border-2 border-primary/30 rounded-lg p-5 text-center shadow-m31">
          <p className="text-title text-foreground mb-1">{exibido.nome}</p>
          <p className="text-micro text-muted-foreground mb-4">Escaneie no dispositivo do voluntário</p>
          <img src={qrUrl(exibido.token)} alt="QR de autorização" className="mx-auto rounded-lg border border-border" width={220} height={220} />
          <div className="mt-4 inline-flex items-center gap-2 bg-accent rounded-lg px-5 py-2.5">
            <KeyRound size={16} className="text-primary" />
            <span className="font-mono text-h1 tracking-[0.3em] text-primary">{exibido.pin}</span>
          </div>
          <p className="text-micro text-muted-foreground mt-2">PIN de ativação — informe pessoalmente ao voluntário</p>
        </div>
      )}

      {/* Lista */}
      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-m31">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Smartphone size={14} className="text-primary" />
          <span className="text-caption text-muted-foreground">Dispositivos autorizados</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-primary" /></div>
        ) : (data || []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum dispositivo autorizado ainda.</p>
        ) : (
          <div className="divide-y divide-border">
            {data.map(d => {
              const cfg = STATUS_CFG[d.status] || STATUS_CFG.pendente;
              return (
                <div key={d.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{d.nome}</p>
                    <p className="text-micro text-muted-foreground">
                      {d.total_checkins || 0} check-ins · por {d.autorizado_por}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-micro font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
                    {d.status !== 'revogado' && (
                      <button
                        onClick={() => revogar.mutate(d.id)}
                        title="Revogar dispositivo"
                        className="p-1.5 rounded-md text-m31-danger hover:bg-m31-danger/10 transition-colors"
                      >
                        <Ban size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}