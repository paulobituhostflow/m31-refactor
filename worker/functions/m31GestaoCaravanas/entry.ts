// @ts-nocheck
import type { HandlerContext } from "../../runtime/types";
import { executeCaravanas } from "./core.js";
import { gestaoFailure } from "./gestaoAccess.js";

export default async function handler(req: Request, context: HandlerContext): Promise<Response> {
  const { client } = context;
  try {
    if (req.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    return Response.json(await executeCaravanas(client, body));
  } catch (error) {
    return gestaoFailure(error);
  }
}
