import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Phone } from 'lucide-react';

export default function M31ConfiguracaoBotWhatsApp() {
  const [novoTelefone, setNovoTelefone] = useState({ numero: '', nome: '' });
  const [erro, setErro] = useState('');
  const [telefonesLocais, setTelefonesLocais] = useState([]);
  const queryClient = useQueryClient();

  // Buscar configuração do M31
  const { data: config, isLoading } = useQuery({
    queryKey: ['m31_config_bot'],
    queryFn: async () => {
      const configs = await base44.entities.EventoM31Config.list('-created_date', 1);
      return configs[0] || null;
    },
    refetchOnMount: 'stale',
    gcTime: 0
  });

  // Sincronizar estado local sempre que config chegar da API
  useEffect(() => {
    if (config && Array.isArray(config.telefones_autorizados)) {
      setTelefonesLocais(config.telefones_autorizados);
    } else if (config && !config.telefones_autorizados) {
      setTelefonesLocais([]);
    }
  }, [config]);

  const atualizarMutation = useMutation({
    mutationFn: async (params) => {
      const { configId, data } = params;
      if (configId) {
        await base44.entities.EventoM31Config.update(configId, data);
      } else {
        await base44.entities.EventoM31Config.create(data);
      }
    },
    onSuccess: () => {
      setErro('');
    },
    onError: (error) => {
      setErro(error.message || 'Erro ao salvar telefone');
      if (config?.telefones_autorizados) {
        setTelefonesLocais(config.telefones_autorizados);
      }
    }
  });

  const handleAdicionarTelefone = async () => {
    if (!novoTelefone.numero || !novoTelefone.nome) {
      setErro('Preencha número e nome');
      return;
    }
    
    const novosTelefones = [...telefonesLocais, { numero: novoTelefone.numero, nome: novoTelefone.nome }];
    setTelefonesLocais(novosTelefones);
    setNovoTelefone({ numero: '', nome: '' });
    
    await atualizarMutation.mutateAsync({
      configId: config?.id,
      data: { telefones_autorizados: novosTelefones }
    });
  };

  const handleRemoverTelefone = async (index) => {
    const novosTelefones = telefonesLocais.filter((_, i) => i !== index);
    setTelefonesLocais(novosTelefones);
    
    await atualizarMutation.mutateAsync({
      configId: config?.id,
      data: { telefones_autorizados: novosTelefones }
    });
  };

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Configuração Bot WhatsApp</h2>
        <p className="text-gray-500 text-sm mt-1">Gerenciar números autorizados a enviar transações</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        {erro && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-3 rounded text-sm">
            {erro}
          </div>
        )}
        <div className="space-y-2">
          <label className="text-gray-900 text-sm font-medium">Adicionar Telefone Autorizado</label>
          <div className="flex gap-2">
            <Input
              placeholder="Número (ex: 5581987654321)"
              value={novoTelefone.numero}
              onChange={(e) => setNovoTelefone({ ...novoTelefone, numero: e.target.value })}
              className="bg-gray-50 border-gray-200 text-gray-900"
            />
            <Input
              placeholder="Nome (ex: Silvestre)"
              value={novoTelefone.nome}
              onChange={(e) => setNovoTelefone({ ...novoTelefone, nome: e.target.value })}
              className="bg-gray-50 border-gray-200 text-gray-900"
            />
            <Button onClick={handleAdicionarTelefone} style={{ background: '#7A1F2B' }} className="hover:opacity-90">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
           <label className="text-gray-500 text-sm">Telefones Autorizados Cadastrados</label>
           <div className="space-y-2">
             {telefonesLocais.length === 0 ? (
               <p className="text-gray-400 text-sm italic">Nenhum telefone autorizado ainda</p>
             ) : (
               telefonesLocais.map((tel, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-gray-50 p-3 rounded">
                  <Phone className="w-4 h-4 text-green-600" />
                  <div className="flex-1">
                    <p className="text-gray-900 text-sm">{tel.nome}</p>
                    <p className="text-gray-500 text-xs">{tel.numero}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoverTelefone(idx)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}