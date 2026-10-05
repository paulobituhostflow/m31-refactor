import { createServer } from "node:http";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { encrypt } from "../migration/crypto.mjs";
const clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  key = process.env.EXPORT_ENCRYPTION_KEY;
if (!clientId || !clientSecret || !key || key.length < 32)
  throw new Error(
    "Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e EXPORT_ENCRYPTION_KEY.",
  );
const redirect = "http://127.0.0.1:9876/callback",
  state = randomBytes(32).toString("hex"),
  verifier = randomBytes(32).toString("base64url");
const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
for (const [k, v] of Object.entries({
  client_id: clientId,
  redirect_uri: redirect,
  response_type: "code",
  access_type: "offline",
  prompt: "consent",
  scope:
    "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
  state,
  code_challenge: createHash("sha256").update(verifier).digest("base64url"),
  code_challenge_method: "S256",
}))
  authorization.searchParams.set(k, v);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, redirect);
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const returned = url.searchParams.get("state") || "";
    if (
      returned.length !== state.length ||
      !timingSafeEqual(Buffer.from(returned), Buffer.from(state)) ||
      !url.searchParams.get("code")
    )
      throw new Error("Callback inválido.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirect,
        grant_type: "authorization_code",
        code: url.searchParams.get("code"),
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.refresh_token)
      throw new Error("OAuth não retornou refresh token.");
    await mkdir("reports/private", { recursive: true, mode: 0o700 });
    await writeFile(
      "reports/private/google-oauth.json.enc",
      encrypt(
        Buffer.from(
          JSON.stringify({
            refresh_token: tokens.refresh_token,
            scope: tokens.scope,
          }),
        ),
        key,
      ),
      { mode: 0o600 },
    );
    res.setHeader("Cache-Control", "no-store");
    res.end(
      "Autorização concluída. Credencial salva criptografada no arquivo privado.",
    );
    server.close();
    clearTimeout(timeout);
  } catch {
    res
      .writeHead(400)
      .end("Falha na autorização. Nenhuma credencial foi exibida.");
  }
});
server.listen(9876, "127.0.0.1", () =>
  console.log(
    "Abra esta URL para autorizar a conta dedicada ao novo ambiente:\n" +
      authorization.href,
  ),
);
const timeout = setTimeout(
  () => {
    server.close();
    process.exitCode = 1;
  },
  10 * 60 * 1000,
);
