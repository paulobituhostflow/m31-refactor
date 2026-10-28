// These routes render the existing team entry before native global login. The
// operational session and all permissions continue to be checked by the backend.
const GESTAO_ENTRY_ROUTES = new Set([
  '/gestao', '/m31-gestao-mobile', '/m31gestaoacesso', '/m31gestaomobile',
]);

export function isGestaoEntryRoute(pathname) {
  const path = String(pathname || '').split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase();
  return GESTAO_ENTRY_ROUTES.has(path);
}

export function gestaoFunctionsVersion(pathname, configuredVersion) {
  return isGestaoEntryRoute(pathname) ? 'prod' : configuredVersion;
}

export function gestaoOperatorIdentity(nome, whatsapp) {
  const name = String(nome || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('Selecione seu nome ou informe seu nome completo.');
  const raw = String(whatsapp || '').replace(/\D/g, '');
  const national = raw.startsWith('55') && raw.length === 13 ? raw.slice(2) : raw;
  if (!/^[1-9]\d9\d{8}$/.test(national) || /^(\d)\1+$/.test(national)) {
    throw new Error('Informe seu WhatsApp com DDD e nove dígitos.');
  }
  return { nome: name, whatsapp: national };
}
