import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import ValidationError from "../domain/errors/validation-error";

const ENCRYPTED_PREFIX = "enc:v1:";

const sanitize = (value?: string | null): string => (value || "").trim();

const getEncryptionKey = (): Buffer | null => {
  const secret = sanitize(process.env.LULU_CREDENTIALS_ENCRYPTION_KEY);
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
};

export const hasLuluCredentialEncryptionKey = (): boolean => Boolean(getEncryptionKey());

export const isEncryptedLuluCredential = (value?: string | null): boolean =>
  sanitize(value).startsWith(ENCRYPTED_PREFIX);

export const encryptLuluCredential = (value?: string | null): string | null => {
  const plain = sanitize(value);
  if (!plain) return null;
  if (isEncryptedLuluCredential(plain)) return plain;

  const key = getEncryptionKey();
  if (!key) return plain;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`;
};

export const decryptLuluCredential = (value?: string | null): string | null => {
  const raw = sanitize(value);
  if (!raw) return null;
  if (!isEncryptedLuluCredential(raw)) return raw;

  const key = getEncryptionKey();
  if (!key) {
    throw new ValidationError(
      "Stored Lulu credentials are encrypted but LULU_CREDENTIALS_ENCRYPTION_KEY is missing."
    );
  }

  const payload = raw.slice(ENCRYPTED_PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new ValidationError("Stored Lulu credentials are malformed.");
  }

  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return sanitize(decrypted) || null;
  } catch {
    throw new ValidationError(
      "Unable to decrypt stored Lulu credentials. Ensure LULU_CREDENTIALS_ENCRYPTION_KEY is correct."
    );
  }
};
