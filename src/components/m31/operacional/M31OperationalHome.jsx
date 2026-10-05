import { Bus, HeartHandshake, Shirt, UsersRound } from 'lucide-react';
import M31OperationCard from './M31OperationCard';
import M31SkeletonList from './M31SkeletonList';

export default function M31OperationalHome({ operatorName, summary, loading, error, onOpen, visibleOperations = ['inscritas', 'voluntarias', 'caravanas'] }) {
  const operations = summary?.operations;
  const firstName = String(operatorName || 'Gestora').trim().split(/\s+/)[0];

  return (
    <section className="space-y-4">
      <header className="pb-2 pt-1">
        <h1 className="text-4xl font-bold tracking-tight text-m31-ink">
          Olá, <span className="text-m31-primary">{firstName}</span>
        </h1>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-800" role="alert">
          Não foi possível atualizar os números agora. A tela não exibirá contagens estimadas.
        </div>
      )}

      {loading ? <M31SkeletonList /> : (
        <div className="space-y-3">
          {visibleOperations.includes('inscritas') && <M31OperationCard title="Inscritas" description="Lista completa de participantes." Icon={UsersRound} official={operations?.inscritas?.total} officialLabel="Inscritas" onClick={() => onOpen('inscritas')} />}
          {visibleOperations.includes('voluntarias') && <M31OperationCard title="Voluntárias" description="Cadastro, pagamento e camisa em uma única fila." Icon={HeartHandshake} official={operations?.voluntarias?.ativas} officialLabel="Ativas conciliadas" action={operations?.voluntarias?.acao} onClick={() => onOpen('voluntarias')} />}
          {visibleOperations.includes('caravanas') && <M31OperationCard title="Caravanas" description="Líder, contato e participantes pendentes." Icon={Bus} official={operations?.caravanas?.regularizadas} officialLabel="Regularizadas" action={operations?.caravanas?.acao} onClick={() => onOpen('caravanas')} />}
          {visibleOperations.includes('camisas') && <M31OperationCard title="Camisas" description="Pagamento, tamanho e entrega em uma única lista." Icon={Shirt} official={operations?.camisas?.pagas} officialLabel="Pagas" action={operations?.camisas?.acao} onClick={() => onOpen('camisas')} />}
        </div>
      )}
    </section>
  );
}