import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get the encryption key from the environment.
 * Must be a 64-character hex string (32 bytes).
 * If not set, generates a deterministic key from JWT_SECRET as fallback.
 */
function getKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(envKey)) {
      throw new Error(
        "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)",
      );
    }
    return Buffer.from(envKey, "hex");
  }

  // Fallback: derive from JWT_SECRET (not ideal but ensures backward compat)
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error(
      "Either ENCRYPTION_KEY or JWT_SECRET must be set for encryption",
    );
  }
  return crypto.createHash("sha256").update(jwtSecret).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} plaintext - The text to encrypt
 * @returns {{ ciphertext: string, iv: string, tag: string }} Hex-encoded encrypted components
 */
export function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * @param {string} ciphertext - Hex-encoded ciphertext
 * @param {string} iv - Hex-encoded initialization vector
 * @param {string} tag - Hex-encoded authentication tag
 * @returns {string} The decrypted plaintext
 */
export function decrypt(ciphertext, iv, tag) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Mask an API key for display purposes.
 * Shows first 7 chars and last 4 chars with asterisks in between.
 * @param {string} key - The API key to mask
 * @returns {string} The masked key
 */
export function maskApiKey(key) {
  if (!key || key.length < 12) return "****";
  return `${key.substring(0, 7)}...${key.substring(key.length - 4)}`;
}
