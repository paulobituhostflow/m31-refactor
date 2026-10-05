// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;
/**
 * m31RecuperarPendentes15Dias — recuperação segura, 1 pessoa por execução.
 * Últimos 15 dias apenas. Nunca envia diretamente: somente M31FilaMensagem.
 */

const ASAAS_BASE = '__ASAAS_API__';
const MAX_POR_HORA = 10;
const VERSAO = 'V3_15D_SAFE';
const AUTOMACAO = 'RECUPERACAO_CHECKOUT';
const STATUS_ALVO = ['pendente', 'checkout_pendente', 'checkout_abandonado'];
const STATUS_PAGO_ASAAS = new Set(['RECEIVED','CONFIRMED','RECEIVED_IN_CASH','DUNNING_RECEIVED']);
const STATUS_CHECKOUT_ATIVO = new Set(['ACTIVE','PENDING']);
const JANELAS = [{ nome:'0-5', ini:0, fim:5 }, { nome:'6-15', ini:6, fim:15 }];

function isoDiasAtras(n:number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}
function phone(raw:any) {
  let d=String(raw||'').replace(/\D/g,'');
  while(d.startsWith('5555')) d=d.slice(2);
  if(d.startsWith('55') && (d.length===12 || d.length===13)) return d;
  if(d.length===10 || d.length===11) return '55'+d;
  return d;
}
function cpf(raw:any){ return String(raw||'').replace(/\D/g,''); }
function email(raw:any){ return String(raw||'').trim().toLowerCase(); }
function teste(i:any){ const n=String(i?.nome||'').toLowerCase(); return n.includes('teste')||n.includes('test ')||n.startsWith('[teste'); }
function pagoLocal(i:any){ return ['aprovado','gratuito'].includes(String(i?.status_pagamento||'')) || i?.estado_canonico==='confirmada' || !!i?.pagamento_confirmado_em; }
function externalRefCheckout(body:any){ return String(body?.externalReference || body?.external_reference || '').trim(); }

async function asaasGet(path:string,key:string){
  try{
    const r=await fetch(ASAAS_BASE+path,{headers:{access_token:key}});
    const b=await r.json().catch(()=>({}));
    return {ok:r.ok,http:r.status,body:b};
  }catch(e:any){ return {ok:false,http:0,body:{},error:String(e?.message||e)}; }
}

async function outrasEvidencias(S:any, atual:any, tel:string){
  const variantes=Array.from(new Set([tel,tel.replace(/^55/,'')].filter(Boolean)));
  const candidatos:any[]=[];
  for(const v of variantes){
    const rs=await S.EventoM31Inscricao.filter({whatsapp:v},'-updated_date',100).catch(()=>[]);
    candidatos.push(...(rs||[]));
  }
  const vistos=new Set<string>();
  const outros=candidatos.filter((x:any)=>x?.id!==atual.id && !vistos.has(x.id) && vistos.add(x.id));
  const concluida=outros.find((x:any)=>pagoLocal(x));
  if(concluida) return {bloqueio:'outra_inscricao_concluida_mesmo_telefone',registro:concluida.id};

  // Compra de camisa não representa inscrição do evento, mas é evidência de outra compra M31.
  // Não bloqueia recuperação de ingresso isoladamente; apenas pedidos financeiros de inscrição bloqueiam.
  return null;
}

async function checkoutSeguro(S:any, insc:any, key:string){
  const id=String(insc.asaas_checkout_id||'').trim();
  const link=String(insc.asaas_charge_url||'').trim();
  if(!id || !link) return {ok:false,motivo:'sem_checkout_id_ou_link'};

  const c=await asaasGet('/checkouts/'+encodeURIComponent(id),key);
  if(!c.ok) return {ok:false,motivo:'checkout_asaas_indisponivel',http:c.http};
  const status=String(c.body?.status||'').toUpperCase();
  if(!STATUS_CHECKOUT_ATIVO.has(status)) return {ok:false,motivo:'checkout_nao_ativo',status};

  const ref=externalRefCheckout(c.body);
  const codigo=String(insc.codigo_inscricao||'').trim();
  // Se o provedor expõe externalReference, ela deve apontar para esta inscrição.
  if(ref && codigo && ref!==codigo) return {ok:false,motivo:'checkout_external_reference_diverge',ref,codigo};

  const liveLink=String(c.body?.link||'').trim();
  if(liveLink && liveLink!==link) return {ok:false,motivo:'checkout_link_diverge'};

  // Conciliação financeira adicional: se existe payment_id, pagamento real tem precedência.
  if(insc.asaas_payment_id){
    const p=await asaasGet('/payments/'+encodeURIComponent(insc.asaas_payment_id),key);
    if(!p.ok) return {ok:false,motivo:'payment_asaas_indisponivel',http:p.http};
    const ps=String(p.body?.status||'').toUpperCase();
    if(STATUS_PAGO_ASAAS.has(ps)) return {ok:false,motivo:'pagamento_confirmado_asaas',status:ps};
    const pref=String(p.body?.externalReference||'').trim();
    if(pref && codigo && pref!==codigo) return {ok:false,motivo:'payment_external_reference_diverge',ref:pref,codigo};
  }
  return {ok:true,link:liveLink||link,status,ref};
}

return (async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const S=base44.asServiceRole.entities;
    const key=config('ASAAS_API_KEY');
    if(!key) return Response.json({skipped:true,reason:'asaas_secret_missing'},{status:503});

    const cfg=(await S.EventoM31Config.list('-created_date',1))[0]||{};
    const modo=cfg.modo_envio_boas_vindas||'pausado';
    if(['pausado','fila'].includes(modo)) return Response.json({skipped:true,reason:'modo_bloqueado',modo});

    // Teto real: conta somente recuperações que o drenador confirmou como enviadas.
    const corteHora=new Date(Date.now()-3600000).toISOString();
    const logsHora=await S.M31AutomacaoLog.filter({automacao:AUTOMACAO,status:'enviado'},'-enviado_em',50).catch(()=>[]);
    const naHora=(logsHora||[]).filter((l:any)=>l.enviado_em && l.enviado_em>=corteHora).length;
    if(naHora>=MAX_POR_HORA) return Response.json({skipped:true,reason:'teto_hora_atingido',enviados_ultima_hora:naHora,limite:MAX_POR_HORA});

    let escolhida:any=null, janelaUsada:string|null=null, checkout:any=null;
    const bloqueios:any[]=[];

    for(const janela of JANELAS){
      const ate=isoDiasAtras(janela.ini);
      const desde=isoDiasAtras(janela.fim);
      const lotes=await Promise.all(STATUS_ALVO.map(st=>S.EventoM31Inscricao.filter({status_pagamento:st},'-created_date',300)));
      const candidatas=lotes.flat()
        .filter((i:any)=>i.created_date && i.created_date>=desde && i.created_date<=ate)
        .filter((i:any)=>!teste(i))
        .sort((a:any,b:any)=>String(b.created_date||'').localeCompare(String(a.created_date||'')));

      const vistos=new Set<string>();
      for(const c of candidatas){
        const tel=phone(c.whatsapp);
        if(tel.length<12){ bloqueios.push({id:c.id,motivo:'telefone_invalido'}); continue; }
        if(vistos.has(tel)) continue;
        vistos.add(tel);

        const atual=await S.EventoM31Inscricao.get(c.id).catch(()=>null);
        if(!atual){ bloqueios.push({id:c.id,motivo:'inscricao_desapareceu'}); continue; }
        if(atual.opt_out){ bloqueios.push({id:c.id,motivo:'opt_out'}); continue; }
        if(pagoLocal(atual)){ bloqueios.push({id:c.id,motivo:'ja_concluida_local'}); continue; }
        if(['cancelado','estornado'].includes(atual.status_pagamento)){ bloqueios.push({id:c.id,motivo:'cancelada'}); continue; }
        if(atual.presenteado_por_id || atual.presenteado_id){ bloqueios.push({id:c.id,motivo:'gift_incompleto'}); continue; }

        const outra=await outrasEvidencias(S,atual,tel);
        if(outra){ bloqueios.push({id:c.id,...outra}); continue; }

        const live=await checkoutSeguro(S,atual,key);
        if(!live.ok){ bloqueios.push({id:c.id,motivo:live.motivo,detalhe:live}); continue; }

        const participante=cpf(atual.cpf)||tel;
        const dedup=`${participante}:${AUTOMACAO}:${VERSAO}`;
        const fila=await S.M31FilaMensagem.filter({dedup_key:dedup},'-created_date',5).catch(()=>[]);
        if((fila||[]).some((f:any)=>['pendente','processando','enviado','incerto','falha_terminal'].includes(f.status))){
          bloqueios.push({id:c.id,motivo:'ja_na_fila_versao_atual'}); continue;
        }
        const logs=await S.M31AutomacaoLog.filter({idempotency_key:dedup},'-enviado_em',5).catch(()=>[]);
        if((logs||[]).some((l:any)=>['pendente','enviado'].includes(l.status))){
          bloqueios.push({id:c.id,motivo:'ja_logado_versao_atual'}); continue;
        }

        escolhida=atual; janelaUsada=janela.nome; checkout=live; break;
      }
      if(escolhida) break;
    }

    if(!escolhida) return Response.json({success:true,enfileirados:0,reason:'nenhuma_elegivel',bloqueios:bloqueios.slice(0,50)});

    // Revalidação final imediatamente antes da fila.
    const atual=await S.EventoM31Inscricao.get(escolhida.id);
    const tel=phone(atual.whatsapp);
    if(atual.opt_out || pagoLocal(atual)) return Response.json({success:true,enfileirados:0,reason:'bloqueada_revalidacao_final'});
    const outra=await outrasEvidencias(S,atual,tel);
    if(outra) return Response.json({success:true,enfileirados:0,reason:outra.bloqueio});
    const live=await checkoutSeguro(S,atual,key);
    if(!live.ok) return Response.json({success:true,enfileirados:0,reason:live.motivo});

    const primeiro=String(atual.nome||'Querida').trim().split(/\s+/)[0]||'Querida';
    const mensagem=`Oi, ${primeiro}! 💚\n\nVimos que sua inscrição para o M31 Filhas foi iniciada, mas ainda não consta como finalizada. Precisa de ajuda para finalizar?\n\nVocê pode concluir por aqui:\n${live.link}\n\n_Se já tiver pago, pode desconsiderar esta mensagem._`;
    const participante=cpf(atual.cpf)||tel;
    const dedup=`${participante}:${AUTOMACAO}:${VERSAO}`;
    const exec=crypto.randomUUID();

    const fila=await S.M31FilaMensagem.create({
      dedup_key:dedup,participante_id:participante,cpf:cpf(atual.cpf)||null,telefone:tel,email:email(atual.email)||null,
      automacao:AUTOMACAO,template:'recuperacao_comercial_v3_15d',versao:VERSAO,origem:'m31RecuperarPendentes15Dias',
      inscricao_id:atual.id,inscricao_nome:atual.nome,mensagens:[{message:mensagem,image_url:null}],
      status:'pendente',aprovado_para_envio:true,prioridade:2,execution_id:exec
    });

    // PENDENTE até o m31DrenarFila receber message_id válido da UAZAPI.
    await S.M31AutomacaoLog.create({
      participante_id:participante,inscricao_principal:atual.id,cpf:cpf(atual.cpf)||null,telefone:tel,email:email(atual.email)||null,
      automacao:AUTOMACAO,template:'recuperacao_comercial_v3_15d',versao:VERSAO,status:'pendente',
      enviado_em:new Date().toISOString(),execution_id:exec,origem:'m31RecuperarPendentes15Dias',idempotency_key:dedup
    });

    await S.EventoM31Inscricao.update(atual.id,{
      fila_recuperacao:true,fila_recuperacao_em:new Date().toISOString(),status_fila_recuperacao:'pendente',
      recovery_attempts:(atual.recovery_attempts||0)+1,ultima_acao:'recuperacao_15d_enfileirada'
    }).catch(()=>{});

    return Response.json({success:true,enfileirados:1,janela:janelaUsada,nome:atual.nome,telefone:tel,fila_id:fila.id,checkout_status:live.status,bloqueios_anteriores:bloqueios.length});
  }catch(e:any){
    return Response.json({success:false,error:String(e?.message||e)},{status:500});
  }
})(req);

}
