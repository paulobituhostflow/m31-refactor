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
test('interface mobile preserva navegação e não depende de assets Base44',async({page})=>{await fixtures(page);await page.setViewportSize({width:390,height:844});const requests=[];page.on('request',request=>requests.push(request.url()));await page.goto('/m31-inscricao');await expect(page.locator('#root')).not.toBeEmpty();expect(requests.some(url=>url.includes('base44.com')||url.includes('base44.app'))).toBe(false);await page.screenshot({path:'test-results/m31-inscricao-mobile.png',fullPage:true});});

test('contrato de login legado recebe access_token e conserva a sessão Supabase',async({page})=>{
 await fixtures(page);const part=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const user={id:'00000000-0000-4000-a000-000000000099',email:'VALIDACAO_LOGIN@example.invalid',user_metadata:{full_name:'VALIDACAO'},app_metadata:{provider:'email'}};const token=part({alg:'HS256',typ:'JWT'})+'.'+part({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated',role:'authenticated'})+'.VALIDACAO_SIGNATURE';
 await page.route('http://127.0.0.1:54321/auth/v1/**',async route=>{const body={access_token:token,refresh_token:'VALIDACAO_REFRESH_TOKEN',expires_in:3600,token_type:'bearer',user};await route.fulfill({status:route.request().method()==='OPTIONS'?204:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS'},contentType:'application/json',body:route.request().method()==='OPTIONS'?'':JSON.stringify(body)});});
 await page.goto('/m31-login');await expect(page.locator('#root')).not.toBeEmpty();const result=await page.evaluate(async()=>{const{base44}=await import('/src/api/base44Client.js');const login=await base44.auth.loginViaEmailPassword('VALIDACAO_LOGIN@example.invalid','VALIDACAO_PASSWORD_ONLY');await base44.auth.setToken(login.access_token);return{token:typeof login.access_token,matching:login.access_token===login.session.access_token};});expect(result).toEqual({token:'string',matching:true});
});
