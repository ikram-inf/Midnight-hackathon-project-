// ---------------------------------------------------------------------------
// MIDNIGHT INTEGRATION
//
// Goal: let the user prove ON-CHAIN that they gave/revoked consent for local
// "training" (the profile facts in db.ts), or that they wiped their data,
// WITHOUT ever putting the conversation content itself on-chain or anywhere
// public. Only a cryptographic commitment (a hash) is ever exposed.
//
// This file gives you:
//   1) a real, working local commitment function (usable right now, no
//      blockchain needed, good enough to demo the concept), and
//   2) the exact hookup points + doc links to wire it to a real Compact
//      contract on Midnight testnet, which is the part that needs the
//      MidnightJS SDK + a wallet connection and is best done by following
//      the official quickstart during the hackathon itself:
//
//      - Install / setup:      https://mlh.link/midnight-hackathon-installation-guide
//      - Example repos:        https://mlh.link/midnight-hackathon-example-repo
//      - Compact language ref: https://mlh.link/midnight-hackathon-compact-reference-doc
//      - MidnightJS (frontend):https://mlh.link/midnight-hackathon-js
//      - Wallet connector:     https://mlh.link/midnight-hackathon-dapp-connector
//
// See contract/consent.compact for the minimal contract this maps to.
// ---------------------------------------------------------------------------

export type ConsentAction = "consent_given" | "consent_revoked" | "data_wiped";

export interface ConsentCommitment {
  action: ConsentAction;
  commitment: string; // hex sha-256 of (userSecret + action + timestamp)
  timestamp: number;
}

// A per-device random secret, generated once and kept only in localStorage.
// It lets the user later prove "this commitment is mine" without revealing
// any personal data, and without a login system.
function getOrCreateDeviceSecret(): string {
  const key = "midnight-chat-device-secret";
  let secret = localStorage.getItem(key);
  if (!secret) {
    secret = crypto.randomUUID();
    localStorage.setItem(key, secret);
  }
  return secret;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Builds the local commitment. Today this just returns the hash so you can
// display/demo it. To actually anchor it on Midnight, submit `commitment`
// (never the secret, never the raw action context) as the argument to the
// Compact contract's `recordConsent` circuit — see consent.compact.
export async function createConsentCommitment(
  action: ConsentAction
): Promise<ConsentCommitment> {
  const secret = getOrCreateDeviceSecret();
  const timestamp = Date.now();
  const commitment = await sha256Hex(`${secret}:${action}:${timestamp}`);
  return { action, commitment, timestamp };
}

// Placeholder for the real on-chain call. Wire this to MidnightJS once the
// wallet + testnet connection is set up (see links above).
export async function submitConsentToMidnight(
  _commitment: ConsentCommitment
): Promise<{ submitted: boolean; note: string }> {
  // TODO (during hackathon): replace with a real MidnightJS provider call,
  // e.g. contract.callTx.recordConsent(_commitment.commitment)
  return {
    submitted: false,
    note:
      "Stub: wire in the real MidnightJS call here once the wallet/testnet is connected.",
  };
}
