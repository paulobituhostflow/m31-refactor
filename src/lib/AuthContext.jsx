import { createContext, useState, useContext, useEffect } from 'react';
import { base44, getSupabase } from '@/api/base44Client';
const AuthContext = createContext(null);
export const AuthProvider = ({ children }) => {
 const [user, setUser] = useState(null); const [loading, setLoading] = useState(true);
 const [appPublicSettings, setSettings] = useState(null);
 async function checkAppState() {
  setLoading(true);
  try { setSettings(await fetch('/api/public-settings').then(r => r.json())); setUser(await base44.auth.me()); }
  catch { setUser(null); } finally { setLoading(false); }
 }
 useEffect(() => {
  checkAppState(); let subscription;
  try { subscription = getSupabase().auth.onAuthStateChange(() => { setTimeout(checkAppState, 0); }).data.subscription; } catch { /* Initial configuration message is shown by the login form. */ }
  return () => subscription?.unsubscribe();
 }, []);
 return <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoadingAuth: loading, isLoadingPublicSettings: false, authError: null, appPublicSettings, logout: (redirect = true) => base44.auth.logout(redirect ? '/m31-login' : undefined), navigateToLogin: () => base44.auth.redirectToLogin(location.href), checkAppState }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider ausente'); return value; };
