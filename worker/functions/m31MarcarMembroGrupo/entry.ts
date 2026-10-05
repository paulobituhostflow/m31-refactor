// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const numerosNoGrupo = [
      "5521999665506","558189772679","558196355191","558197334888","558199649195",
      "558196707158","558191901152","558191264547","558192955819","558195156500",
      "558796263046","558798000585","558788159182","558191154001","558199495223",
      "558197213732","558796129008","558186118584","558799104058","558798193293",
      "558179052909","558798108379","558186393272","558198997358","558187696674",
      "558799398722","558788567795","558192066795","558196670224","558781260076",
      "559291304256","558171010012","558188710201","558791621597","558796113319",
      "558187607787","558189526356","558183541666","558194060437","558781642825",
      "558796062703","558198483664","558796811695","558788144138","558184614110",
      "558188955055","558195078977","558193275991","558199010726","558196564423",
      "558194019175","558796689042","558188069464","558189736892","558188819195",
      "558181593143","558186107165","558191166022","558199617278","558799063976",
      "558173136509","558196261212","558196335468","558195595117","558799679067",
      "558194833535","558184199580","558192989007","558198268282","558186824532",
      "558788012285","5521979171910","558796075548","558781274199","559491115384",
      "558796150612","558799950621","558197036945","558192186851","558185858629",
      "558796258340","558193838917","558196546725","558799968960","558192962701",
      "558798231975","558186088913","558184198761","558796582281","558788025284",
      "558781301759","558197694508","558799944707","558796568865","558184069611",
      "558189211801","558196795722","558197783456","558179117213","558194490992",
      "558199416701","558199003027","558799215988","558194041763","558191935352",
      "558199866001","558199031412","558199330125","558799201803","5511960110202",
      "558186316461","558182872820","558191477971","558187201071","558186945149",
      "558187084845","558196000813","558796262816","558796501154","558788776706",
      "558198793036","558195914088","558188247833","558197852012","558799721011",
      "558791242055","558188248484","558387702792","558796752979","558796213431",
      "558199133550","558798053304","558781601413","558195200464","558796234352",
      "558194696402","558186763117","558191018223","558192994479","558198880686",
      "558195784661","558799721819","558198601339","558195192931","558192808129",
      "558792018122","558191807211"
    ];

    const agora = new Date().toISOString();
    const aprovadas = await base44.asServiceRole.entities.EventoM31Inscricao.filter({
      status_pagamento: 'aprovado'
    });

    let marcadas = 0;
    let naoEncontradas = 0;

    for (const inscricao of aprovadas) {
      const telBase = (inscricao.whatsapp || '').replace(/\D/g, '');
      // Tenta match direto e também versão sem o 9º dígito (para números do grupo em formato antigo)
      const telSem9 = telBase.length === 13 ? telBase.slice(0,4) + telBase.slice(5) : telBase;
      const noGrupo = numerosNoGrupo.includes(telBase) || numerosNoGrupo.includes(telSem9);
      if (noGrupo) {
        try {
          await base44.asServiceRole.entities.EventoM31Inscricao.update(inscricao.id, {
            data_envio_boas_vindas: agora,
            status_envio_grupo: 'enviado'
          });
          marcadas++;
        } catch (err) {
          logger.error(`Erro ao marcar ${inscricao.id}:`, err.message);
        }
        // Throttle para evitar rate limit
        await new Promise(r => setTimeout(r, 100));
      } else {
        naoEncontradas++;
      }
    }

    return Response.json({
      marcadas_no_grupo: marcadas,
      fora_do_grupo: naoEncontradas,
      total: aprovadas.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
