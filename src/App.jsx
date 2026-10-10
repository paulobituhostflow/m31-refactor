import './App.css'
import M31AuthCallback from './pages/M31AuthCallback';
import M31ResetPassword from './pages/M31ResetPassword';
import { Toaster } from "@/components/ui/toaster"
import { FeedbackToaster } from "@/components/m31/ui/Toast"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import M31InscricaoPage from './pages/M31Inscricao'
import M31AdminPage from './pages/M31Admin';
import M31LandingPage from './pages/M31Landing';
import M31SemAcessoPage from './pages/M31SemAcesso';
import M31CoordenadorPage from './pages/M31Coordenador';
import M31CaravanaForm from './pages/M31CaravanaForm';
import M31ServirForm from './pages/M31ServirForm';
import M31AcceptInvite from './pages/M31AcceptInvite';
import M31Obrigado from './pages/M31Obrigado';
import M31BrandingPanel from './pages/M31BrandingPanel';
import M31Login from './pages/M31Login';
import M31Portal from './pages/M31Portal';
import M31GestaoHome from './pages/M31GestaoHome';
import M31AdminDashboard from './pages/M31AdminDashboard';
import M31Cartinhas from './pages/M31Cartinhas';
import M31CartinhasPrintPage from './pages/M31CartinhasPrint';
import M31AuditoriaGruposPage from './pages/M31AuditoriaGruposPage';
import M31ExportarIntercessao from './pages/M31ExportarIntercessao';
import M31Transferir from './pages/M31Transferir';
import M31CompletarCadastro from './pages/M31CompletarCadastro';
import M31RevisaoDuplicados from './pages/M31RevisaoDuplicados';
import M31MinhasTarefas from './pages/M31MinhasTarefas';
import M31GestaoMobile from './pages/M31GestaoMobile';
import M31GestaoAcesso from './pages/M31GestaoAcesso';
import M31GestaoRapida from './pages/M31GestaoRapida';
import M31CheckinDevice from './pages/M31CheckinDevice';
import M31ModelosMensagens from './pages/M31ModelosMensagens';
import M31AuditoriaGapQR from './pages/M31AuditoriaGapQR';
import M31ReconciliacaoAsaas from './pages/M31ReconciliacaoAsaas';
import M31AuditoriaPagamentos72h from './pages/M31AuditoriaPagamentos72h';
import M31AuditoriaRecuperacao72h from './pages/M31AuditoriaRecuperacao72h';
import M31RetomarPagamento from './pages/M31RetomarPagamento';
import M31Camisas from './pages/M31Camisas';
import RequireAdmin from './components/RequireAdmin';
import RequireCartinhas from './components/RequireCartinhas';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import { isCartinhasRoute } from './components/m31/cartinhas/cartinhasRouteAccess';
import RequireM31Panel from './components/RequireM31Panel';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : null;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();
  const { pathname } = useLocation();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  // Só as rotas de Cartinhas usam a entrada própria. RequireCartinhas continua
  // exigindo autorização no backend antes de renderizar qualquer carta.
  if (authError && !isCartinhasRoute(pathname)) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/m31-auth-callback" element={<M31AuthCallback />} />
      <Route path="/m31-reset-password" element={<M31ResetPassword />} />
      <Route path="/" element={<M31GestaoHome />} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/m31-inscricao" element={<M31InscricaoPage />} />
      <Route path="/m31-admin" element={<RequireM31Panel panel="management"><M31AdminPage /></RequireM31Panel>} />
      <Route path="/m31" element={<M31LandingPage />} />
      <Route path="/m31-sem-acesso" element={<M31SemAcessoPage />} />
      <Route path="/m31-coordenador" element={<RequireM31Panel panel="coordination"><M31CoordenadorPage /></RequireM31Panel>} />
      <Route path="/m31-caravana" element={<M31CaravanaForm />} />
      <Route path="/caravanam31filhas/tia-carla-recife" element={<M31CaravanaForm caravanaId="6a19aeba11ec4815b2ce9b7a" />} />
      <Route path="/m31-servir" element={<M31ServirForm />} />
      <Route path="/m31-accept-invite" element={<M31AcceptInvite />} />
      <Route path="/obrigado" element={<M31Obrigado />} />
      <Route path="/admin/branding" element={<RequireAdmin><M31BrandingPanel /></RequireAdmin>} />
      <Route path="/m31-login" element={<M31Login />} />
      <Route path="/portal" element={<M31Portal />} />
      <Route path="/admin" element={<RequireAdmin><M31AdminDashboard /></RequireAdmin>} />
      <Route path="/cartinhas" element={<RequireCartinhas><M31Cartinhas /></RequireCartinhas>} />
      <Route path="/cartinhas-imprimir" element={<RequireCartinhas><M31CartinhasPrintPage /></RequireCartinhas>} />
      <Route path="/auditoria-grupos" element={<M31AuditoriaGruposPage />} />
      <Route path="/exportar-intercessao" element={<RequireAdmin><M31ExportarIntercessao /></RequireAdmin>} />
      <Route path="/transferir/:token" element={<M31Transferir />} />
      <Route path="/completar-cadastro/:token" element={<M31CompletarCadastro />} />
      <Route path="/revisao-duplicados" element={<RequireAdmin><M31RevisaoDuplicados /></RequireAdmin>} />
      <Route path="/minhas-tarefas" element={<M31MinhasTarefas />} />
      <Route path="/gestao" element={<M31GestaoAcesso />} />
      <Route path="/m31-gestao-mobile" element={<M31GestaoMobile />} />
      <Route path="/gestao-rapida" element={<M31GestaoRapida />} />
      <Route path="/checkin-dispositivo" element={<M31CheckinDevice />} />
      <Route path="/modelos-mensagens" element={<M31ModelosMensagens />} />
      <Route path="/auditoria-gap-qr" element={<RequireAdmin><M31AuditoriaGapQR /></RequireAdmin>} />
      <Route path="/reconciliacao-asaas" element={<RequireAdmin><M31ReconciliacaoAsaas /></RequireAdmin>} />
      <Route path="/auditoria-pagamentos-72h" element={<RequireAdmin><M31AuditoriaPagamentos72h /></RequireAdmin>} />
      <Route path="/auditoria-recuperacao-72h" element={<RequireAdmin><M31AuditoriaRecuperacao72h /></RequireAdmin>} />
      <Route path="/retomar-pagamento/:codigo" element={<M31RetomarPagamento />} />
      <Route path="/m31-camisas" element={<M31Camisas />} />
      <Route path="/camisas" element={<M31Camisas />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <FeedbackToaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
