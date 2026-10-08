import{test,expect}from'@playwright/test';
const publicRoutes=['/m31','/m31-inscricao','/m31-servir','/m31-caravana','/camisas','/m31-login','/transferir/VALIDACAO','/completar-cadastro/VALIDACAO'];
async function fixtures(page){await page.route('**/api/**',async route=>{const request=route.request(),url=new URL(request.url());if(!url.pathname.startsWith('/api/')){await route.continue();return;}let result={};let status=200;const body=request.postDataJSON();
 if(url.pathname==='/api/public-settings')result={public_settings:{name:'M31',auth_required:false}};
 else if(url.pathname==='/api/auth/me'){status=401;result={error:'Entre com sua conta.'};}
 else if(url.pathname.includes('/entities/'))result=[{id:'VALIDACAO_LOTE',nome:'VALIDACAO',codigo:'VALIDACAO',ativo:true,ordem:1,valor:120}];
 else if(url.pathname.includes('m31CamisaVendaPayment'))result=body?.action==='config'?{ativo:true,precos:{1:65,2:120,3:165},modelos_ativos:['milagres','jesus','filhas']}:{found:false};
 else if(url.pathname.includes('m31CamisasOfertaPublica'))result={ativo:false};
 else if(url.pathname.includes('m31ConsultarTransferencia')||url.pathname.includes('m31ConsultarCadastroConvidada'))result={valido:false,motivo_invalido:'nao_encontrado'};
 else if(url.pathname.includes('m31-caravana-flow'))result={caravanas:[],lotes:[]};
 else if(url.pathname.includes('m31ListarIgrejasConhecidas'))result={igrejas:[]};
 else if(url.pathname.includes('m31VoluntarioPayment'))result={found:false};
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});});}
for(const route of publicRoutes)test(`preserva a tela pública ${route}`,async({page})=>{await fixtures(page);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(route);await expect(page.locator('body')).not.toBeEmpty();await expect(page.locator('#root')).not.toBeEmpty();await page.waitForTimeout(300);expect(errors).toEqual([]);expect(await page.locator('#root').innerText()).not.toContain('Cannot read properties');});

test('entrada geral distingue a gestão e mantém contas de cartinhas fora da sessão operacional',async({page})=>{
 await fixtures(page);
 await page.goto('/m31-login');
 await expect(page.getByRole('heading',{name:'Entrar no M31'})).toBeVisible();
 await page.getByRole('link',{name:'Gestão operacional da equipe'}).click();
 await expect(page.getByRole('heading',{name:'Gestão Operacional'})).toBeVisible();
 const membro={ativo:true,perfil:'cartinhas'};
 await page.route('**/api/auth/me',route=>route.fulfill({json:{id:'VALIDACAO',role:'user',email:'validacao@example.invalid',full_name:'VALIDACAO',membro}}));
 let opened=0;await page.route('**/api/functions/m31AbrirSessaoOperacional',route=>{opened++;return route.fulfill({json:{}});});
 await page.reload();
 await page.locator('select[name=operador_preselecionado]').selectOption('Paulo');
 await page.locator('input[name=whatsapp]').fill('81999999999');
 await page.getByRole('button',{name:'Continuar com VALIDACAO'}).click();
 await expect(page.getByRole('alert')).toContainText('Esta conta não possui perfil de gestão');
 expect(opened).toBe(0);
});

test('primeiro login valida a senha antiga uma vez e segue pelo perfil de gestão',async({page})=>{
 await fixtures(page);
 const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const user={id:'00000000-0000-4000-a000-000000000097',email:'validacao@example.invalid',user_metadata:{full_name:'VALIDACAO'},app_metadata:{provider:'email'}};
 const token=part({alg:'HS256',typ:'JWT'})+'.'+part({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})+'.VALIDACAO_SIGNATURE';
 let logins=0,migrations=0;
 const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS','Access-Control-Expose-Headers':'X-Supabase-Api-Version','X-Supabase-Api-Version':'2024-01-01'};
 await page.route('http://127.0.0.1:54321/auth/v1/**',async route=>{
   const request=route.request();if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
   if(new URL(request.url()).pathname.endsWith('/token')){
     expect(request.postDataJSON()).toMatchObject({email:user.email,password:'VALIDACAO_OLD_PASSWORD'});
     logins++;
     if(logins===1){await route.fulfill({status:400,headers,json:{code:'invalid_credentials',msg:'Invalid login credentials'}});return;}
   }
   await route.fulfill({headers,json:{access_token:token,refresh_token:'VALIDACAO_REFRESH',expires_in:3600,token_type:'bearer',user}});
 });
 await page.route('**/api/auth/legacy-password',async route=>{
   migrations++;expect(route.request().postDataJSON()).toEqual({email:user.email,password:'VALIDACAO_OLD_PASSWORD'});
   expect(route.request().headers().authorization).toBeUndefined();await route.fulfill({json:{success:true}});
 });
 const membro={id:'VALIDACAO_MEMBRO',ativo:true,perfil:'gestao_operacional',user_email:user.email};
 await page.route('**/api/auth/me',route=>route.fulfill({json:{...user,role:'user',membro}}));
 await page.route('**/api/entities/**',route=>route.fulfill({json:route.request().url().includes('EventoM31Membro')?[membro]:[]}));
 await page.goto('/m31-login');await page.locator('input[type=email]').fill(user.email);await page.locator('input[type=password]').fill('VALIDACAO_OLD_PASSWORD');await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page).toHaveURL(/\/m31-admin$/);await expect(page.getByText('Visão Geral',{exact:true}).first()).toBeVisible();
 expect(logins).toBe(2);expect(migrations).toBe(1);
});
test('interface mobile preserva navegação e não depende de assets Base44',async({page})=>{await fixtures(page);await page.setViewportSize({width:390,height:844});const requests=[];page.on('request',request=>requests.push(request.url()));await page.goto('/m31-inscricao');await expect(page.locator('#root')).not.toBeEmpty();expect(requests.some(url=>url.includes('base44.com')||url.includes('base44.app'))).toBe(false);await page.screenshot({path:'test-results/m31-inscricao-mobile.png',fullPage:true});});

test('contrato de login legado recebe access_token e conserva a sessão Supabase',async({page})=>{
 await fixtures(page);const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const user={id:'00000000-0000-4000-a000-000000000099',email:'VALIDACAO_LOGIN@example.invalid',user_metadata:{full_name:'VALIDACAO'},app_metadata:{provider:'email'}};const token=part({alg:'HS256',typ:'JWT'})+'.'+part({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})+'.VALIDACAO_SIGNATURE';
 await page.route('http://127.0.0.1:54321/auth/v1/**',async route=>{const body={access_token:token,refresh_token:'VALIDACAO_REFRESH_TOKEN',expires_in:3600,token_type:'bearer',user};await route.fulfill({status:route.request().method()==='OPTIONS'?204:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS'},contentType:'application/json',body:route.request().method()==='OPTIONS'?'':JSON.stringify(body)});});
 await page.goto('/m31-login');await expect(page.locator('#root')).not.toBeEmpty();const result=await page.evaluate(async()=>{const{base44}=await import('/src/api/base44Client.js');const login=await base44.auth.loginViaEmailPassword('VALIDACAO_LOGIN@example.invalid','VALIDACAO_PASSWORD_ONLY');await base44.auth.setToken(login.access_token);return{token:typeof login.access_token,matching:login.access_token===login.session.access_token};});expect(result).toEqual({token:'string',matching:true});
});


test('perfil operacional abre o painel e conserva a separação do financeiro',async({page})=>{
 await fixtures(page);
 const membro={id:'VALIDACAO_MEMBRO',user_email:'VALIDACAO@example.invalid',nome:'VALIDACAO',perfil:'gestao_operacional',ativo:true};
 await page.route('**/api/auth/me',route=>route.fulfill({json:{id:'VALIDACAO_USER',email:membro.user_email,full_name:'VALIDACAO',role:'user',membro}}));
 await page.route('**/api/entities/**',route=>route.fulfill({json:route.request().url().includes('EventoM31Membro')?[membro]:[]}));
 await page.goto('/m31-admin');
 await expect(page.getByText('Visão Geral',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Inscrições',{exact:true}).first()).toBeVisible();
 await expect(page.getByText('Dashboard Financeiro',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Seu perfil não tem acesso a este painel.')).toHaveCount(0);
 await page.goto('/admin');
 await expect(page.getByText('Apenas administradores podem acessar esta página.')).toBeVisible();
});

test('link privado permite definir senha e remove a credencial da URL',async({page})=>{
 await fixtures(page);
 const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const user={id:'00000000-0000-4000-a000-000000000098',email:'VALIDACAO_SENHA@example.invalid',user_metadata:{},app_metadata:{provider:'email'}};
 const token=part({alg:'HS256',typ:'JWT'})+'.'+part({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})+'.VALIDACAO_SIGNATURE';
 let verifications=0,updates=0;
 await page.route('http://127.0.0.1:54321/auth/v1/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,PUT,GET,OPTIONS'}});return;}
  if(path.endsWith('/verify')){verifications++;expect(request.postDataJSON()).toMatchObject({token_hash:'VALIDACAO_HASH',type:'recovery'});}
  if(path.endsWith('/user')&&request.method()==='PUT'){updates++;expect(request.postDataJSON().password.length).toBeGreaterThanOrEqual(12);}
  const body=path.endsWith('/user')?user:{access_token:token,refresh_token:'VALIDACAO_REFRESH',expires_in:3600,token_type:'bearer',user};
  await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:body});
 });
 await page.goto('/m31-reset-password#token_hash=VALIDACAO_HASH&type=recovery');
 await expect(page.getByLabel('Nova senha')).toBeEnabled();
 await expect(page.getByText('Conta: '+user.email)).toBeVisible();
 expect(new URL(page.url()).hash).toBe('');
 await page.getByLabel('Nova senha').fill('VALIDACAO_PASSWORD_2026');
 await page.getByRole('button',{name:'Salvar senha'}).click();
 await expect(page.getByText('Senha atualizada. Você já pode entrar no painel.')).toBeVisible();
 expect(verifications).toBe(1);expect(updates).toBe(1);
});
