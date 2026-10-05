// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

const ASAAS_BASE = '__ASAAS_API__';
const VERSAO = 'CARAVANA_REC_V1';
const STATUS_PAGO = new Set(['PAID','RECEIVED','CONFIRMED','RECEIVED_IN_CASH','DUNNING_RECEIVED']);
const STATUS_ATIVO = new Set(['ACTIVE','PENDING']);
const STATUS_EXPIRADO = new Set(['EXPIRED','CANCELED','CANCELLED','OVERDUE','DELETED','REFUNDED']);

function phone(v:any){
  let d=String(v||'').replace(/\D/g,'');
  while(d.startsWith('5555')) d=d.slice(2);
  if(d.startsWith('55') && d.length>=12) return d;
  if(d.length>=10) return `55${d}`;
  return d;
}

function proximaJanelaRecife(){
  const agora=new Date();
  const recife=new Date(agora.getTime()-3*3600000);
  const h=recife.getUTCHours();
  if(h>=8 && h<20) return agora.toISOString();
  const prox=new Date(recife);
  if(h>=20) prox.setUTCDate(prox.getUTCDate()+1);
  prox.setUTCHours(8,5,0,0);
  return new Date(prox.getTime()+3*3600000).toISOString();
}

async function getCheckout(id:string,key:string){
  try{
    const r=await fetch(`${ASAAS_BASE}/checkouts/${encodeURIComponent(id)}`,{headers:{access_token:key}});
    const body=await r.json().catch(()=>({}));
    if(!r.ok) return {ok:false,http:r.status,status:null,link:null,raw:body};
    return {ok:true,http:r.status,status:String(body?.status||'').toUpperCase(),link:body?.link||null,raw:body};
  }catch(e:any){
    return {ok:false,http:0,status:null,link:null,error:String(e?.message||e)};
  }
}

async function novoCheckout(insc:any,key:string){
  const externalReference=insc.codigo_inscricao || `M31-CAR-REC-${Date.now().toString(36).toUpperCase()}`;
  const payload={
    billingTypes:['PIX','CREDIT_CARD'],
    chargeTypes:['DETACHED','INSTALLMENT'],
    installment:{maxInstallmentCount:2},
    minutesToExpire:1440,
    externalReference,
    callback:{
      successUrl:'__APP_ORIGIN__/obrigado',
      cancelUrl:'__APP_ORIGIN__/m31-caravana',
      expiredUrl:'__APP_ORIGIN__/m31-caravana'
    },
    items:[{name:'M31 Filhas - Caravana',description:`Inscrição via caravana - ${insc.nome}`,value:97,quantity:1}]
  };
  try{
    const r=await fetch(`${ASAAS_BASE}/checkouts`,{method:'POST',headers:{access_token:key,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const body=await r.json().catch(()=>({}));
    if(!r.ok || !body?.link || !body?.id) return {ok:false,http:r.status,raw:body};
    return {ok:true,id:body.id,link:body.link,status:String(body.status||'ACTIVE').toUpperCase(),externalReference};
  }catch(e:any){ return {ok:false,http:0,error:String(e?.message||e)}; }
}

return (async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const S=base44.asServiceRole.entities;
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'auditar_recentes');
    const desde=String(body?.desde||new Date(Date.now()-72*3600000).toISOString());
    const ASAAS_KEY=config('ASAAS_API_KEY');
    if(!ASAAS_KEY) return Response.json({ok:false,error:'asaas_secret_missing'},{status:500});

    const rows=await S.EventoM31Inscricao.filter({
      tipo:'caravana',
      updated_date:{$gte:desde}
    },'-updated_date',500);

    const audit:any[]=[];
    for(const insc of rows||[]){
      const item:any={
        id:insc.id,nome:insc.nome,whatsapp:phone(insc.whatsapp),email:insc.email||'',
        caravana_id:insc.caravana_id||null,caravana_nome:insc.caravana_nome||null,
        estado_canonico:insc.estado_canonico||null,status_pagamento:insc.status_pagamento,
        etapa_alcancada:insc.etapa_funil||null,
        falha_tecnica:!!insc.falha_tecnica,
        falha_tecnica_etapa:insc.falha_tecnica_etapa||null,
        falha_tecnica_erro:insc.falha_tecnica_erro||null,
        opt_out:!!insc.opt_out,
        checkout_id:insc.asaas_checkout_id||null,checkout_status_salvo:insc.asaas_checkout_status||null,
        link:insc.asaas_charge_url||null,updated_date:insc.updated_date,
        decisao:'revisar_manual',status_financeiro:'nao_verificado',motivo_interrupcao:null,acao_recomendada:'revisar_manual'
      };
      if(insc.opt_out){ item.decisao='opt_out'; item.status_financeiro='bloqueado_por_opt_out'; item.acao_recomendada='nao_contatar'; audit.push(item); continue; }
      if(['aprovado','gratuito'].includes(insc.status_pagamento)){
        item.decisao='confirmada'; item.status_financeiro=insc.status_pagamento; item.acao_recomendada='nao_recuperar'; audit.push(item); continue;
      }
      if(!['checkout_pendente','pendente','checkout_abandonado'].includes(insc.status_pagamento)){
        item.decisao='historico_fora_fluxo_atual'; item.status_financeiro=insc.status_pagamento||'desconhecido'; item.acao_recomendada='nao_recuperar'; audit.push(item); continue;
      }
      if(insc.estado_canonico && !['pendente','revisar'].includes(insc.estado_canonico)){
        item.decisao='nao_recuperar_estado_canonico'; audit.push(item); continue;
      }
      if(!item.whatsapp || item.whatsapp.length<12){ item.decisao='nao_recuperar_sem_whatsapp'; audit.push(item); continue; }
      if(insc.asaas_checkout_id){
        const live=await getCheckout(insc.asaas_checkout_id,ASAAS_KEY);
        item.checkout_live=live.status; item.checkout_http=live.http;
        if(!live.ok){ item.decisao='revisar_asaas_indisponivel'; item.status_financeiro='asaas_indisponivel'; item.acao_recomendada='aguardar_conciliacao'; audit.push(item); continue; }
        item.status_financeiro=live.status||'desconhecido';
        if(STATUS_PAGO.has(live.status)){ item.decisao='pendente_local_com_evidencia_pagamento'; item.acao_recomendada='conciliar_sem_cobrar'; audit.push(item); continue; }
        if(STATUS_ATIVO.has(live.status)){ item.decisao='checkout_ativo_pendente'; item.link=live.link||item.link; item.acao_recomendada='potencialmente_recuperavel_apos_revisao'; audit.push(item); continue; }
        if(STATUS_EXPIRADO.has(live.status)){ item.decisao='checkout_expirado'; item.acao_recomendada='potencialmente_recuperavel_apos_revisao'; audit.push(item); continue; }
        item.decisao='revisar_status_asaas'; item.acao_recomendada='revisar_manual'; audit.push(item); continue;
      }
      item.status_financeiro='sem_checkout';
      item.motivo_interrupcao=insc.falha_tecnica ? (insc.falha_tecnica_erro||insc.falha_tecnica_etapa||'falha_tecnica') : 'intencao_sem_checkout';
      item.decisao=insc.falha_tecnica ? 'tentativa_com_falha_tecnica' : 'intencao_sem_checkout';
      item.acao_recomendada='potencialmente_recuperavel_apos_revisao';
      audit.push(item);
    }

    if(action==='auditar_recentes'){
      const potencialmenteRecuperaveis=audit.filter(x=>['intencao_sem_checkout','tentativa_com_falha_tecnica','checkout_ativo_pendente','checkout_expirado'].includes(x.decisao));
      return Response.json({
        ok:true,desde,total:audit.length,
        categorias:{
          A_intencao_sem_checkout:audit.filter(x=>x.decisao==='intencao_sem_checkout'),
          B_tentativa_falha_tecnica:audit.filter(x=>x.decisao==='tentativa_com_falha_tecnica'),
          C_checkout_realmente_pendente:audit.filter(x=>x.decisao==='checkout_ativo_pendente'),
          D_pendente_local_com_evidencia_pagamento:audit.filter(x=>x.decisao==='pendente_local_com_evidencia_pagamento'),
          E_confirmadas:audit.filter(x=>x.decisao==='confirmada'),
          F_opt_out:audit.filter(x=>x.decisao==='opt_out'),
          G_historicos_fora_fluxo:audit.filter(x=>x.decisao==='historico_fora_fluxo_atual')
        },
        potencialmente_recuperaveis:potencialmenteRecuperaveis,
        todos:audit
      });
    }

    if(action!=='preparar_recentes') return Response.json({ok:false,error:'acao_invalida'},{status:400});

    // Recuperação automática segura: primeiro contato NÃO cria novo checkout e
    // NÃO envia link. O objetivo é retomar a conversa sem risco de cobrança duplicada.
    const resultado:any[]=[];
    const recuperaveis=new Set(['intencao_sem_checkout','tentativa_com_falha_tecnica','checkout_ativo_pendente','checkout_expirado']);
    const corte24h=new Date(Date.now()-24*3600000).toISOString();
    for(const a of audit){
      if(!recuperaveis.has(a.decisao)){ resultado.push({...a,preparado:false,motivo:'nao_elegivel'}); continue; }
      const insc=(rows||[]).find((r:any)=>r.id===a.id);
      if(!insc){ resultado.push({...a,preparado:false,motivo:'inscricao_nao_localizada'}); continue; }
      const tel=phone(insc.whatsapp);
      if(!tel || tel.length<12){ resultado.push({...a,preparado:false,motivo:'whatsapp_invalido'}); continue; }

      // Safety net por telefone: se a mesma mulher já possui inscrição ativa/paga,
      // não iniciar recuperação desta tentativa de caravana.
      const variantes=[tel,tel.replace(/^55/,'')];
      let compraAtiva:any=null;
      for(const v of variantes){
        const outras=await S.EventoM31Inscricao.filter({whatsapp:v},'-updated_date',50).catch(()=>[]);
        compraAtiva=(outras||[]).find((o:any)=>o.id!==insc.id && ['aprovado','gratuito'].includes(o.status_pagamento));
        if(compraAtiva) break;
      }
      if(compraAtiva){ resultado.push({...a,preparado:false,motivo:'compra_ativa_mesmo_telefone',inscricao_ativa_id:compraAtiva.id}); continue; }

      // Cooldown real de 24h por telefone/pessoa, incluindo itens ainda na fila.
      const logs=await S.M31AutomacaoLog.filter({telefone:tel,automacao:'RECUPERACAO_CHECKOUT'},'-enviado_em',20).catch(()=>[]);
      const recente=(logs||[]).find((l:any)=>l.enviado_em && l.enviado_em>=corte24h && ['enviado','pendente'].includes(l.status));
      const filaExistente=await S.M31FilaMensagem.filter({telefone:tel,automacao:'RECUPERACAO_CHECKOUT'},'-created_date',20).catch(()=>[]);
      const bloqueante=(filaExistente||[]).find((f:any)=>['pendente','processando','enviado','incerto','falha_terminal'].includes(f.status));
      if(recente || bloqueante){ resultado.push({...a,preparado:false,motivo:'recuperacao_24h_ou_fila_ativa'}); continue; }

      const primeiro=String(insc.nome||'minha irmã').trim().split(/\s+/)[0]||'minha irmã';
      const mensagem=`Oi, ${primeiro}! Paz, minha irmã! 💛\nVimos que você tentou se inscrever no M31 Filhas e queremos saber se teve alguma dificuldade. Posso te ajudar?`;
      const participante=insc.cpf||tel;
      const dedup=`${participante}:RECUPERACAO_CHECKOUT:${VERSAO}`;
      const agendado=proximaJanelaRecife();
      const fila=await S.M31FilaMensagem.create({
        dedup_key:dedup,participante_id:participante,cpf:insc.cpf||null,telefone:tel,email:insc.email||null,
        automacao:'RECUPERACAO_CHECKOUT',template:'recuperacao_manual_v1',versao:VERSAO,origem:'m31-caravana-recuperacao:72h',
        inscricao_id:insc.id,inscricao_nome:insc.nome,mensagens:[{message:mensagem,image_url:null}],status:'pendente',
        aprovado_para_envio:true,prioridade:2,agendado_para:agendado
      });
      await S.M31AutomacaoLog.create({
        participante_id:participante,inscricao_principal:insc.id,cpf:insc.cpf||null,telefone:tel,email:insc.email||null,
        automacao:'RECUPERACAO_CHECKOUT',template:'recuperacao_manual_v1',versao:VERSAO,status:'pendente',enviado_em:new Date().toISOString(),
        cooldown_ate:new Date(Date.now()+24*3600000).toISOString(),origem:'m31-caravana-recuperacao:72h',idempotency_key:dedup
      }).catch(()=>{});
      await S.EventoM31Inscricao.update(insc.id,{
        fila_recuperacao:true,fila_recuperacao_em:new Date().toISOString(),status_fila_recuperacao:'enviado',
        last_recovery_at:new Date().toISOString(),last_contact_at:new Date().toISOString(),ultima_acao:'recuperacao_caravana_72h_enfileirada'
      }).catch(()=>{});
      resultado.push({...a,preparado:true,fila_id:fila.id,agendado_para:agendado});
    }

    return Response.json({ok:true,desde,total:audit.length,preparados:resultado.filter(x=>x.preparado).length,bloqueados:resultado.filter(x=>!x.preparado).length,resultado});
  }catch(e:any){
    return Response.json({ok:false,error:String(e?.message||e)},{status:500});
  }
})(req);
}
