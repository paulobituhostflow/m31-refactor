const origin = process.env.APP_ORIGIN;
if (!origin) throw new Error("APP_ORIGIN obrigatória.");
for (const path of ["/api/health", "/api/public-settings"]) {
  const response = await fetch(new URL(path, origin), {
    signal: AbortSignal.timeout(15000),
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    throw new Error(`Smoke falhou: ${path}`);
  const body = await response.json();
  if (path === "/api/health" && body.status !== "ok")
    throw new Error("Banco indisponível.");
}
const unknown = await fetch(new URL("/api/unknown-smoke", origin));
if (
  unknown.status !== 404 ||
  !unknown.headers.get("content-type")?.includes("application/json")
)
  throw new Error("Fallback incorreto nas rotas API.");
console.log("Smoke HTTP concluído.");
