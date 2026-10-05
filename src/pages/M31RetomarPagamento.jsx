import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { M31Logo } from '@/components/M31Logo';

const BRAND = '#8B1A2B';
const BG = '#FAF7F2';
const INK = '#2A1F1F';
const MUTED = '#6B5E5E';
const BORDER = '#E5DDD5';

export default function M31RetomarPagamento() {
  const { codigo } = useParams();
  const [estado, setEstado] = useState('carregando'); // carregando | redirecionando | ja_pago | erro
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await base44.functions.invoke('m31RetomarPagamento', { codigo });
        if (!ativo) return;
        const d = res.data || res;
        if (d.ja_pago) {
          setEstado('ja_pago');
          setDados(d);
          return;
        }
        if (d.link) {
          setEstado('redirecionando');
          setDados(d);
          // Redireciona para o checkout Asaas (válido por 24h a partir do clique)
          window.location.href = d.link;
          return;
        }
        setEstado('erro');
        setErro(d.error || 'Não foi possível gerar o link de pagamento.');
      } catch (err) {
        if (!ativo) return;
        setEstado('erro');
        setErro(err?.response?.data?.error || err?.message || 'Erro ao processar pagamento.');
      }
    })();
    return () => { ativo = false; };
  }, [codigo]);

  return (
    <div style={{ minHeight: '100vh', background: BG, color: INK, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center' }}>
        <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'center' }}>
          <M31Logo />
        </div>

        {estado === 'carregando' && (
          <div>
            <div style={{ width: '40px, height: 40px', margin: '0 auto 20px' }}>
              <div style={{ width: '40px', height: '40px', border: `4px solid ${BORDER}`, borderTopColor: BRAND, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Preparando seu pagamento...</h1>
            <p style={{ fontSize: '14px', color: MUTED }}>Gerando um link de pagamento seguro.</p>
          </div>
        )}

        {estado === 'redirecionando' && (
          <div>
            <div style={{ width: '40px', height: '40px', border: `4px solid ${BORDER}`, borderTopColor: BRAND, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
            <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Redirecionando...</h1>
            <p style={{ fontSize: '14px', color: MUTED, marginBottom: '16px' }}>
              {dados?.nome ? `${dados.nome}, ` : ''}você será levada(a) ao pagamento.
            </p>
            {dados?.link && (
              <a href={dados.link} style={{ display: 'inline-block', padding: '12px 24px', background: BRAND, color: '#fff', borderRadius: '8px', fontSize: '14px', fontWeight: 600, textDecoration: 'none' }}>
                Abrir pagamento (R$ {dados?.valor})
              </a>
            )}
          </div>
        )}

        {estado === 'ja_pago' && (
          <div>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#16A34A', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#fff', fontSize: '28px', fontWeight: 700 }}>✓</span>
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Inscrição já paga!</h1>
            <p style={{ fontSize: '14px', color: MUTED }}>
              {dados?.nome ? `${dados.nome}, ` : ''}sua inscrição já está confirmada. Não é necessário pagar novamente.
            </p>
          </div>
        )}

        {estado === 'erro' && (
          <div>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FEE2E2', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: BRAND, fontSize: '28px', fontWeight: 700 }}>!</span>
            </div>
            <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Não foi possível gerar o link</h1>
            <p style={{ fontSize: '14px', color: MUTED, marginBottom: '20px' }}>
              {erro === 'nao_encontrado'
                ? 'Este link não é válido. Verifique o link recebido ou entre em contato com o suporte.'
                : erro === 'opt_out'
                ? 'Esta inscrição optou por não receber comunicações. Entre em contato com o suporte.'
                : erro === 'aguarde_alguns_segundos'
                ? 'Aguarde alguns segundos e tente novamente.'
                : erro || 'Ocorreu um erro inesperado.'}
            </p>
            <a href="/m31-inscricao" style={{ display: 'inline-block', padding: '10px 20px', border: `1px solid ${BORDER}`, color: INK, borderRadius: '8px', fontSize: '14px', textDecoration: 'none' }}>
              Voltar para inscrição
            </a>
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}