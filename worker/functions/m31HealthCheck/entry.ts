import type {HandlerContext} from "../../runtime/types";
export default async function handler(_req:Request,context:HandlerContext):Promise<Response>{
 const result=await context.health();
 return Response.json(result);
}
