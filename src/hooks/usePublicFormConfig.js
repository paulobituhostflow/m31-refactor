// Hook de configuração dos formulários públicos editáveis.
// Renderiza imediatamente com os defaults (nunca quebra / nunca pisca) e
// atualiza quando a config salva chega do servidor.
import { useEffect, useState } from 'react';
import { PUBLIC_FORMS, loadFormConfig, mergeFormConfig } from '@/components/m31/builder/publicFormsCatalog';

export function usePublicFormConfig(formId) {
  const def = PUBLIC_FORMS[formId];
  const [config, setConfig] = useState(() => mergeFormConfig(formId, null));

  useEffect(() => {
    let cancelled = false;
    loadFormConfig(formId)
      .then((cfg) => { if (!cancelled) setConfig(cfg); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [formId]);

  const T = (chave) => config.textos[chave] ?? def.defaults.textos[chave] ?? '';
  const campo = (id) => config.campos[id] || { label: id, placeholder: '', helper: '', visivel: true, obrigatorio: true };
  const bloco = (id) => config.blocos?.[id] !== false;

  return { config, T, campo, bloco, extras: config.extras || [] };
}