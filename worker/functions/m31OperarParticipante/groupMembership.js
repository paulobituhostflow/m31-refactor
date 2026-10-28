export function phoneAliases(raw){
 const value=String(raw||'').trim();if(!value||/@lid$/i.test(value)||/@g\.us$/i.test(value))return [];
 let p=value.replace(/:\d+(?=@)/,'').replace(/@(?:s\.whatsapp\.net|c\.us)$/i,'').replace(/\D/g,'');
 if(/^0055\d{10,11}$/.test(p))p=p.slice(2);
 if(/^\d{10,11}$/.test(p))p='55'+p;
 if(!/^\d{8,15}$/.test(p))return [];
 const aliases=[p];
 if(/^55\d{2}9\d{8}$/.test(p))aliases.push(p.slice(0,4)+p.slice(5));
 return aliases;
}

export function groupSnapshot(data,jid,now=Date.now()){
 if(!data||data.error)throw Error('grupo_atual_consulta_invalida');
 const reported=data.JID||data.jid||data.id;
 if(reported&&reported!==jid)throw Error('grupo_atual_resposta_divergente');
 const participants=Array.isArray(data.Participants)?data.Participants:Array.isArray(data.participants)?data.participants:null;
 if(!participants?.length)throw Error('grupo_atual_lista_ausente_ou_vazia');
 if(Number(data.ParticipantCount)>0&&Number(data.ParticipantCount)!==participants.length)throw Error('grupo_atual_lista_incompleta');
 const phones=new Set();let unresolved=0;
 for(const p of participants){
  const identifiers=typeof p==='string'?[p]:[p.JID,p.jid,p.id,p.user];
  const fields=[...(typeof p==='string'?[]:[p.PhoneNumber,p.phoneNumber,p.phone,p.number]),
   ...identifiers.filter(v=>/@(?:s\.whatsapp\.net|c\.us)$/i.test(String(v||'')))];
  const found=fields.flatMap(phoneAliases);
  if(!found.length)unresolved++;else found.forEach(x=>phones.add(x));
 }
 return {group_jid:jid,fetched_at:new Date(now).toISOString(),participants:participants.length,unresolved,phones:[...phones]};
}

export function groupDecision(snapshot,phone,now=Date.now()){
 if(!snapshot||!snapshot.fetched_at||!Array.isArray(snapshot.phones)||now-Date.parse(snapshot.fetched_at)>60000||Date.parse(snapshot.fetched_at)>now+5000)
  return {allowed:false,reason:'grupo_atual_nao_verificado'};
 if(phoneAliases(phone).some(p=>snapshot.phones.includes(p)))return {allowed:false,in_group:true,reason:'contato_esta_no_grupo_atual'};
 if(snapshot.unresolved>0)return {allowed:false,reason:'grupo_com_participantes_sem_telefone_resolvido'};
 return {allowed:true,in_group:false,reason:'ausencia_no_grupo_verificada_agora'};
}

export async function loadOfficialGroup(S,readGroup){
 const configs=await S.M31GrupoConfig.filter({finalidade:'INSCRITAS_OFICIAL',ativo:true},'-created_date',2);
 if(configs.length!==1||!/^\d+@g\.us$/.test(String(configs[0].chat_id||'')))throw Error('grupo_oficial_ausente_ou_ambiguo');
 const jid=configs[0].chat_id;
 return groupSnapshot(await readGroup(jid),jid);
}
