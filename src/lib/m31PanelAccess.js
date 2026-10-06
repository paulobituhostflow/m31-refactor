const managementProfiles = ['gestao_operacional', 'coordenador', 'coordenadora_geral', 'gestora_inscricoes', 'coordenacao_participantes', 'visualizacao'];

export function getM31HomeRoute(user) {
  if (user?.role === 'admin') return '/admin';
  if (user?.membro?.ativo !== true) return '/m31-sem-acesso';
  const profile = user.membro.perfil;
  if (['gestora_inscricoes', 'visualizacao'].includes(profile)) return '/m31-gestao-mobile';
  if (managementProfiles.includes(profile)) return '/m31-admin';
  if (profile === 'cartinhas') return '/cartinhas';
  if (['lider_setor', 'checkin', 'voluntario'].includes(profile)) return '/m31-coordenador';
  return '/m31-sem-acesso';
}

export function canOpenM31Panel(user, panel) {
  if (!['management', 'coordination'].includes(panel)) return false;
  if (user?.role === 'admin') return true;
  if (user?.membro?.ativo !== true) return false;
  const profiles = panel === 'coordination'
    ? [...managementProfiles, 'lider_setor', 'checkin', 'voluntario']
    : managementProfiles;
  return profiles.includes(user.membro.perfil);
}
