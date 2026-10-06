const managementProfiles = ['gestao_operacional', 'coordenador', 'coordenadora_geral', 'gestora_inscricoes', 'coordenacao_participantes', 'visualizacao'];

export function canOpenM31Panel(user, panel) {
  if (!['management', 'coordination'].includes(panel)) return false;
  if (user?.role === 'admin') return true;
  if (user?.membro?.ativo !== true) return false;
  const profiles = panel === 'coordination'
    ? [...managementProfiles, 'lider_setor', 'checkin', 'voluntario']
    : managementProfiles;
  return profiles.includes(user.membro.perfil);
}
