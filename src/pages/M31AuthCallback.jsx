import { useEffect, useState } from 'react';
import { getSupabase } from '@/api/base44Client';
export default function M31AuthCallback() {
 const [error,setError]=useState('');
 useEffect(()=>{(async()=>{try{const code=new URLSearchParams(location.search).get('code');const {data:current,error:sessionError}=await getSupabase().auth.getSession();if(sessionError)throw sessionError;if(code&&!current.session){const {error}=await getSupabase().auth.exchangeCodeForSession(code);if(error)throw error;}const target=sessionStorage.getItem('m31_return_to')||'/portal';sessionStorage.removeItem('m31_return_to');location.replace(target.startsWith('/')&&!target.startsWith('//')?target:'/portal');}catch{setError('Não foi possível concluir o login. Volte à tela de entrada e tente novamente.');}})();},[]);
 return <main className="p-8">{error||'Concluindo login…'}</main>;
}
