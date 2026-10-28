import { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useM31Gestao } from '@/hooks/useM31Gestao';
import { gestaoError } from '@/lib/m31GestaoApi';
import M31CamisasMobile from '@/components/m31/operacional/M31CamisasMobile';
import M31InscritasOperational from '@/components/m31/operacional/inscritas/M31InscritasOperational';
import M31VoluntariasOperational from '@/components/m31/operacional/voluntarias/M31VoluntariasOperational';
import M31OperationalShell from '@/components/m31/operacional/M31OperationalShell';
import M31SkeletonList from '@/components/m31/operacional/M31SkeletonList';
import GestaoAreaConsulta from '@/components/m31/operacional/gestao/GestaoAreaConsulta';
import GestaoCaravanas from '@/components/m31/operacional/gestao/GestaoCaravanas';
import M31GestaoEquipeAcessos from '@/components/m31/gestao/M31GestaoEquipeAcessos';

const AREA_ORDER = ['inscritas', 'voluntarias', 'caravanas', 'camisas'];

export default function M31GestaoMobile() {
  const context = useM31Gestao();
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState('inscritas');
  const data = context.data;
  const visibleAreas = useMemo(() => {
    const permitted = data?.areas || data?.operacoes_permitidas || [];
    return [...AREA_ORDER.filter((area) => permitted.includes(area)), ...(data?.can_manage_team ? ['equipe'] : [])];
  }, [data]);
  const activeArea = visibleAreas.includes(activeView) ? activeView : visibleAreas[0];
  const canOperate = data?.modo === 'operacao';

  useEffect(() => {
    if (visibleAreas.length && !visibleAreas.includes(activeView)) setActiveView(visibleAreas[0]);
  }, [visibleAreas, activeView]);

  function logout() {
    localStorage.removeItem('m31_operador_atual');
    queryClient.clear();
    base44.auth.logout('/gestao');
  }

  if (context.isLoading) return <main className="m31-gestao"><div className="m31-gestao-workspace"><p className="m31-gestao-eyebrow" style={{ paddingTop: 32, marginBottom: 24 }}>Abrindo sua gestão…</p><M31SkeletonList /></div></main>;
  if (context.error || !data?.session_id) return <main className="m31-gestao m31-gestao-access"><section className="m31-gestao-access-card"><p className="m31-gestao-eyebrow">Gestão M31 Filhas</p><h1>Acesse sua conta</h1><p role="alert" className="m31-gestao-muted">{gestaoError(context.error)}</p><button type="button" className="m31-gestao-btn m31-gestao-btn-primary" onClick={() => { localStorage.removeItem('m31_operador_atual'); window.location.assign('/gestao'); }}>Entrar com a senha da equipe</button><button type="button" className="m31-gestao-btn" onClick={() => context.refetch()}>Verificar acesso novamente</button></section></main>;

  return <M31OperationalShell operatorName={data.operador_nome} areas={visibleAreas} modo={data.modo} adminAccess={data.is_admin === true} activeView={activeArea} onNavigate={setActiveView} onLogout={logout}>
    {!visibleAreas.length && <div className="m31-gestao-empty"><h1>Nenhuma área liberada</h1><p>Peça ao administrador que confira seu acesso.</p></div>}
    {activeArea === 'inscritas' && <M31InscritasOperational sessionId={data.session_id} canOperate={canOperate} />}
    {['voluntarias', 'camisas'].includes(activeArea) && !canOperate && <GestaoAreaConsulta key={activeArea} sessionId={data.session_id} area={activeArea} />}
    {activeArea === 'voluntarias' && canOperate && <M31VoluntariasOperational sessionId={data.session_id} />}
    {activeArea === 'caravanas' && <GestaoCaravanas sessionId={data.session_id} canOperate={canOperate} canOperateInscritas={canOperate && visibleAreas.includes('inscritas')} />}
    {activeArea === 'camisas' && canOperate && <M31CamisasMobile sessionId={data.session_id} />}
    {activeArea === 'equipe' && data.can_manage_team && <M31GestaoEquipeAcessos sessionId={data.session_id} />}
  </M31OperationalShell>;
}
