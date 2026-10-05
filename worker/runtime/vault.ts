import { ApiError, type JsonRecord } from "./types";
export const TOKEN_FIELDS = [
  "token",
  "pedido_token",
  "retomada_token",
  "cadastro_token",
  "transferencia_token",
  "device_token",
];
export async function sha256(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function key(secret: string) {
  if (!secret || secret.length < 32)
    throw new ApiError(
      503,
      "Configure TOKEN_ENCRYPTION_KEY (32 caracteres ou mais).",
      "configuration_required",
    );
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
export async function sealTokens(
  record: JsonRecord,
  secret: string,
): Promise<JsonRecord> {
  const result = structuredClone(record);
  const sealed: JsonRecord = {};
  for (const field of TOKEN_FIELDS) {
    if (!result[field] || typeof result[field] !== "string") continue;
    const plaintext = result[field];
    if (plaintext.startsWith("sha256:"))
      throw new ApiError(422, "Token já protegido sem conteúdo original.");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await key(secret),
      new TextEncoder().encode(plaintext),
    );
    sealed[field] = { iv: b64(iv), value: b64(new Uint8Array(bytes)) };
    result[field] = `sha256:${await sha256(plaintext)}`;
  }
  if (Object.keys(sealed).length) result._sealed_tokens = sealed;
  return result;
}
export async function openTokens(
  record: JsonRecord,
  secret: string,
): Promise<JsonRecord> {
  const result = structuredClone(record);
  for (const [field, item] of Object.entries(result._sealed_tokens || {})) {
    const sealed = item as { iv: string; value: string };
    const bytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(sealed.iv) },
      await key(secret),
      unb64(sealed.value),
    );
    result[field] = new TextDecoder().decode(bytes);
  }
  delete result._sealed_tokens;
  return result;
}
export async function secureEqual(a: string, b: string) {
  const av = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)),
  );
  const bv = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(b)),
  );
  let diff = a.length ^ b.length;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}
