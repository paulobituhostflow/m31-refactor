import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
export const digest = (data) => createHash("sha256").update(data).digest("hex");
function key(secret) {
  if (!secret || secret.length < 32)
    throw new Error(
      "Configure EXPORT_ENCRYPTION_KEY com pelo menos 32 caracteres.",
    );
  return createHash("sha256").update(secret).digest();
}
export function encrypt(data, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
export function decrypt(data, secret) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    data.subarray(0, 12),
  );
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
