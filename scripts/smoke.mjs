const origin = process.env.APP_ORIGIN;
if (!origin) throw new Error("APP_ORIGIN obrigatória.");

const retryDelays = [1000, 2000, 4000, 8000, 8000];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryRequest(path, isReady) {
  let lastResult = "sem resposta";
  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      const response = await fetch(new URL(path, origin), {
        signal: AbortSignal.timeout(10000),
      });
      if (await isReady(response)) return response;
      lastResult = `HTTP ${response.status}`;
    } catch (error) {
      lastResult = error instanceof Error ? error.message : "erro de rede";
    }
    if (attempt < retryDelays.length) await sleep(retryDelays[attempt]);
  }
  throw new Error(`Smoke falhou: ${path} (${lastResult})`);
}

async function jsonIsReady(response) {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    return false;
  return response.json();
}

await retryRequest("/api/health", async (response) => {
  const body = await jsonIsReady(response);
  return body !== false && body.status === "ok";
});
await retryRequest("/api/public-settings", async (response) => {
  const body = await jsonIsReady(response);
  return body !== false;
});
await retryRequest(
  "/api/unknown-smoke",
  (response) =>
    response.status === 404 &&
    Boolean(response.headers.get("content-type")?.includes("application/json")),
);
console.log("Smoke HTTP concluído.");
