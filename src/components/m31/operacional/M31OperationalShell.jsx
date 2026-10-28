import { Bus, HeartHandshake, LogOut, Shirt, UsersRound, Users } from 'lucide-react';
import VersiculoDoDia from './gestao/VersiculoDoDia';
import './gestao/m31Gestao.css';

const AREAS = {
  inscritas: { label: 'Inscritas', Icon: UsersRound },
  voluntarias: { label: 'Voluntárias', Icon: HeartHandshake },
  caravanas: { label: 'Caravanas', Icon: Bus },
  camisas: { label: 'Camisas', Icon: Shirt },
  equipe: { label: 'Equipe', Icon: Users },
};

export default function M31OperationalShell({ operatorName, activeView, areas = [], modo, adminAccess = false, onNavigate, onLogout, children }) {
  return <div className="m31-gestao">
    <header className="m31-gestao-topbar"><div className="m31-gestao-topbar-inner">
      <a href="/m31-gestao-mobile" className="m31-gestao-brand" aria-label="M31 Filhas"><img src="/assets/a22f06b49_LOGOM31FILHAS1.png" alt="M31 Filhas" /><span>M31 Filhas</span></a>
      <div className="m31-gestao-personal"><div className="m31-gestao-identity"><strong>{operatorName}</strong><span>{modo === 'consulta' ? 'Somente consulta' : 'Operação'}</span></div><VersiculoDoDia /></div>
      <button type="button" className="m31-gestao-btn m31-gestao-btn-quiet m31-gestao-logout" onClick={onLogout} aria-label="Sair da minha conta"><LogOut size={18} aria-hidden="true" /><span>Sair</span></button>
    </div></header>
    <div className="m31-gestao-workspace">
      <nav className="m31-gestao-nav" aria-label="Navegação principal">
        {areas.filter((area) => AREAS[area]).map((area) => {
          const { label, Icon } = AREAS[area];
          return <button key={area} type="button" onClick={() => onNavigate(area)} aria-current={activeView === area ? 'page' : undefined}><Icon size={19} aria-hidden="true" />{label}</button>;
        })}
      </nav>
      <main className="m31-gestao-content" id="gestao-conteudo">{children}</main>
      {adminAccess && <footer className="m31-gestao-admin-link"><a href="/admin">Painel administrativo</a></footer>}
    </div>
  </div>;
}
