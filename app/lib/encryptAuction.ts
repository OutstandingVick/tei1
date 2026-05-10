export type PrivateAuctionSide = "yes" | "no";

export type PrivateAuctionIntent = {
  id: string;
  fixture: string;
  market: string;
  side: PrivateAuctionSide;
  amount: number;
  sealedCommitment: string;
  createdAt: string;
};

export const ENCRYPT_PRE_ALPHA_NOTE =
  "Encrypt pre-alpha currently demonstrates the confidential-programming architecture; production privacy guarantees depend on the Encrypt devnet/mainnet release.";

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSealedIntent(input: {
  fixture: string;
  market: string;
  side: PrivateAuctionSide;
  amount: number;
}) {
  const payload = JSON.stringify({
    ...input,
    nonce: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );

  return {
    id: crypto.randomUUID(),
    ...input,
    sealedCommitment: `enc-prealpha:${toHex(digest).slice(0, 32)}`,
    createdAt: new Date().toISOString(),
  } satisfies PrivateAuctionIntent;
}

export function deriveOpeningOdds(intents: PrivateAuctionIntent[]) {
  const yesDemand = intents
    .filter((intent) => intent.side === "yes")
    .reduce((sum, intent) => sum + intent.amount, 0);
  const noDemand = intents
    .filter((intent) => intent.side === "no")
    .reduce((sum, intent) => sum + intent.amount, 0);
  const total = yesDemand + noDemand;

  if (total <= 0) {
    return {
      yesDemand,
      noDemand,
      yesPrice: 0.5,
      noPrice: 0.5,
    };
  }

  return {
    yesDemand,
    noDemand,
    yesPrice: noDemand / total,
    noPrice: yesDemand / total,
  };
}
