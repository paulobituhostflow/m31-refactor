import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Busca inscrição existente por CPF, WhatsApp ou e-mail.
 * Retorna a inscrição mais recente encontrada (ou null).
 * Debounce de 600ms para evitar requests excessivos.
 */
export function useInscricaoExistente({ cpf, whatsapp, email, enabled = true }) {
  const [inscricaoExistente, setInscricaoExistente] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const lastQueryRef = useRef('');

  useEffect(() => {
    if (!enabled) { setInscricaoExistente(null); return; }

    const cpfLimpo = (cpf || '').replace(/\D/g, '');
    const wppLimpo = (whatsapp || '').replace(/\D/g, '');
    const emailLimpo = (email || '').toLowerCase().trim();

    const hasCpf = cpfLimpo.length === 11;
    const hasWpp = wppLimpo.length >= 10;
    const hasEmail = emailLimpo.includes('@');
    if (!hasCpf && !hasWpp && !hasEmail) {
      setInscricaoExistente(null);
      return;
    }

    const queryKey = `${cpfLimpo}|${wppLimpo}|${emailLimpo}`;
    if (queryKey === lastQueryRef.current) return;
    lastQueryRef.current = queryKey;

    const debounce = setTimeout(async () => {
      setBuscando(true);
      try {
        let results = [];

        // 1. Buscar por CPF (mais confiável)
        if (hasCpf) {
          results = await base44.entities.EventoM31Inscricao.filter(
            { cpf: cpfLimpo }, '-updated_date', 5
          );
        }

        // 2. Se não achou, buscar por WhatsApp
        if ((!results || results.length === 0) && hasWpp) {
          const wppFull = wppLimpo.startsWith('55') && wppLimpo.length >= 12
            ? wppLimpo
            : '55' + wppLimpo;
          results = await base44.entities.EventoM31Inscricao.filter(
            { whatsapp: wppFull }, '-updated_date', 5
          );
        }

        // 3. Se não achou, buscar por e-mail
        if ((!results || results.length === 0) && hasEmail) {
          results = await base44.entities.EventoM31Inscricao.filter(
            { email: emailLimpo }, '-updated_date', 5
          );
        }

        if (results && results.length > 0) {
          setInscricaoExistente(results[0]);
        } else {
          setInscricaoExistente(null);
        }
      } catch (e) {
        setInscricaoExistente(null);
      } finally {
        setBuscando(false);
      }
    }, 600);

    return () => clearTimeout(debounce);
  }, [cpf, whatsapp, email, enabled]);

  return { inscricaoExistente, buscando };
}