import { TAMANHOS } from '@/lib/m31VoluntariaConsolidado';

/**
 * Quantidade real por tamanho, separando confirmadas (pagas/isentas)
 * de pendentes de pagamento — nunca soma as duas como se fossem certeza.
 */
export default function CamisasResumoTamanhos({ tamanhos, faltando }) {
  const totalConf = TAMANHOS.reduce((s, t) => s + tamanhos[t].confirmadas, 0);
  const totalPend = TAMANHOS.reduce((s, t) => s + tamanhos[t].pendentes, 0);

  return (
    <div className="bg-card border border-border rounded-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-caption text-muted-foreground">Quantidade por tamanho</div>
        <div className="text-sm text-muted-foreground">
          {totalConf} confirmadas · {totalPend} a confirmar
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {TAMANHOS.map((t) => (
          <div key={t} className="border border-border rounded-md p-3 text-center">
            <div className="text-micro text-muted-foreground mb-1">{t}</div>
            <div className="text-h2 text-foreground leading-none">{tamanhos[t].confirmadas}</div>
            <div className="text-micro text-muted-foreground mt-1">
              {tamanhos[t].pendentes > 0 ? `+${tamanhos[t].pendentes} a confirmar` : '—'}
            </div>
          </div>
        ))}
      </div>

      {faltando > 0 && (
        <div className="mt-3 text-sm text-muted-foreground">
          {faltando} voluntária{faltando > 1 ? 's' : ''} ainda não informou o tamanho — não entram em nenhuma contagem acima.
        </div>
      )}
    </div>
  );
}