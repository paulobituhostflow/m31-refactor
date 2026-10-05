// Exercises the migrated domain body under the existing deterministic harness.
exports.prepare = source => "import { createClientFromRequest } from 'test:legacy-boundary';\n" + source
 .replace(/^import type .*\n/gm, '')
 .replace(/export default async function handler\(req: Request, context: HandlerContext\): Promise<Response> \{\n const \{ client, config, fetch, logger \} = context;\n const createClientFromRequest = \(_req: Request\) => client;\n/, '')
 .replace(/\n\}\s*$/, '')
 .replace('return (async', 'Deno.serve(async')
 .replace(/\}\)\(req\);/, '});')
 .replace(/\bconfig\(/g, 'Deno.env.get(')
 .replace(/\blogger\./g, 'console.')
 .replaceAll('__ASAAS_API__', 'https://api.asaas.com/v3')
 .replaceAll('__APP_ORIGIN__', 'https://example.invalid');
