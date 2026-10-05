// @ts-nocheck -- Ported legacy domain implementation; typed request/runtime boundary in worker/runtime.

import type { HandlerContext } from "../../runtime/types";
export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
 const { client, config, fetch, logger } = context;
 const createClientFromRequest = (_req: Request) => client;

return (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const churches = await base44.asServiceRole.entities.Church.filter({ slug: 'm31' });
    if (!churches || churches.length === 0) {
      return Response.json({ error: 'Church m31 not found' }, { status: 404 });
    }

    const church = churches[0];
    return Response.json({
      id: church.id,
      name: church.name,
      slug: church.slug,
      zapi_instance_id: church.zapi_instance_id ? '***' : 'not_set'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
})(req);
}
