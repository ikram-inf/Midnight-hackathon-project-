const encoder = new TextEncoder();
const decoder = new TextDecoder();

const SECRET = "VaultAI_Local_Key_2026";

async function getKey() {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(SECRET)
  );

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(text: string): Promise<string> {
  const key = await getKey();

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoder.encode(text)
  );

  const bytes = new Uint8Array(iv.length + encrypted.byteLength);

  bytes.set(iv, 0);
  bytes.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...bytes));
}

export async function decrypt(cipherText: string): Promise<string> {
  const bytes = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));

  const iv = bytes.slice(0, 12);
  const data = bytes.slice(12);

  const key = await getKey();

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data
  );

  return decoder.decode(decrypted);
}
