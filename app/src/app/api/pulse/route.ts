/* ── PulseMFB API Proxy ──────────────────────────────────────
   Server-side route that signs requests with HMAC-SHA256
   and proxies them to the PulseMFB bank transfer API.

   Env vars:
     PULSE_API_URL          — base URL (default: https://api.pulsemfb.com)
     PULSE_PUBLIC_KEY       — pk_live_...
     PULSE_PRIVATE_KEY      — sk_live_...
     PULSE_DEBIT_ACCOUNT    — settlement account number to debit from
     PULSE_SETTLEMENT_WALLET — Stellar address that receives on-chain burns
     STELLAR_HORIZON_URL    — Horizon endpoint for tx verification
   ──────────────────────────────────────────────────────────── */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const PULSE_API_URL =
  process.env.PULSE_API_URL || "https://api.pulsemfb.com";
const PULSE_PUBLIC_KEY = process.env.PULSE_PUBLIC_KEY || "";
const PULSE_PRIVATE_KEY = process.env.PULSE_PRIVATE_KEY || "";
const PULSE_DEBIT_ACCOUNT = process.env.PULSE_DEBIT_ACCOUNT || "";
const SETTLEMENT_WALLET = process.env.PULSE_SETTLEMENT_WALLET || "";
const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";

/* ── Anti-replay: track consumed txHashes ──────────────────── */
const usedTxHashes = new Set<string>();

function sign(
  method: string,
  path: string,
  body: string,
  timestamp: string,
): string {
  const payload = timestamp + method + path + body;
  return crypto
    .createHmac("sha256", PULSE_PRIVATE_KEY)
    .update(payload)
    .digest("hex");
}

async function pulseFetch(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const signature = sign(method, path, bodyStr, timestamp);

  const res = await fetch(`${PULSE_API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-public-key": PULSE_PUBLIC_KEY,
      "x-signature": signature,
      "x-timestamp": timestamp,
    },
    ...(method === "POST" && body ? { body: bodyStr } : {}),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as Record<string, string>).message ||
        `PulseMFB error ${res.status}`,
    );
  }
  return data;
}

/* ── On-chain burn verification ─────────────────────────────
   Verifies that a Stellar transaction:
   1. Exists and succeeded on-chain
   2. Sent payment to our settlement wallet
   3. Hasn't already been used for a previous payout
   ──────────────────────────────────────────────────────────── */

async function verifyBurnTx(
  txHash: string,
  expectedAmountStroops: bigint,
): Promise<{ valid: boolean; error?: string }> {
  if (!SETTLEMENT_WALLET) {
    return { valid: false, error: "PULSE_SETTLEMENT_WALLET not configured" };
  }

  // Anti-replay
  if (usedTxHashes.has(txHash)) {
    return { valid: false, error: "Transaction already used for a payout" };
  }

  // Fetch transaction from Horizon
  const txRes = await fetch(`${HORIZON_URL}/transactions/${txHash}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!txRes.ok) {
    return { valid: false, error: "Transaction not found on Stellar" };
  }
  const tx = await txRes.json();
  if (!tx.successful) {
    return { valid: false, error: "Transaction failed on-chain" };
  }

  // Fetch operations to verify payment to settlement wallet
  const opsRes = await fetch(
    `${HORIZON_URL}/transactions/${txHash}/operations?limit=50`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!opsRes.ok) {
    return { valid: false, error: "Could not fetch transaction operations" };
  }
  const ops = await opsRes.json();
  const records = ops._embedded?.records || [];

  // Look for a payment or path_payment to our settlement wallet
  let totalReceived = 0n;
  for (const op of records) {
    const isPayment =
      op.type === "payment" || op.type === "path_payment_strict_receive" || op.type === "path_payment_strict_send";
    if (!isPayment) continue;
    if (op.to !== SETTLEMENT_WALLET) continue;

    // Convert amount to stroops (7 decimals)
    const parts = op.amount.split(".");
    const whole = BigInt(parts[0]) * 10_000_000n;
    const frac = parts[1]
      ? BigInt(parts[1].padEnd(7, "0").slice(0, 7))
      : 0n;
    totalReceived += whole + frac;
  }

  if (totalReceived < expectedAmountStroops) {
    return {
      valid: false,
      error: `Insufficient payment: received ${totalReceived} stroops, expected ${expectedAmountStroops}`,
    };
  }

  // Mark as consumed
  usedTxHashes.add(txHash);
  return { valid: true };
}

/* ── POST handler ─────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  if (!PULSE_PUBLIC_KEY || !PULSE_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "PulseMFB not configured" },
      { status: 503 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = payload;

  try {
    switch (action) {
      /* ── Initiate bank transfer (requires on-chain burn proof) ── */
      case "transfer": {
        const { amount, bankCode, accountNumber, narration, reference, txHash } =
          payload as {
            amount: number;
            bankCode: string;
            accountNumber: string;
            narration?: string;
            reference?: string;
            txHash?: string;
          };

        if (!txHash) {
          return NextResponse.json(
            { error: "txHash required — submit the on-chain burn transaction hash" },
            { status: 400 },
          );
        }

        // Convert NGN amount to expected stroops for verification
        // amount is in kobo (NGN minor unit), we verify the on-chain
        // payment matches. The caller must ensure the on-chain payment
        // covers the payout amount at the agreed exchange rate.
        const expectedStroops = BigInt(Math.round(amount)) * 10_000n; // rough floor — real rate comes from quote

        const verification = await verifyBurnTx(txHash, expectedStroops);
        if (!verification.valid) {
          return NextResponse.json(
            { error: `Burn verification failed: ${verification.error}` },
            { status: 403 },
          );
        }

        const ref =
          (reference as string) || `veil_${Date.now().toString(36)}`;

        const data = await pulseFetch(
          "POST",
          "/api/v1/external-api/transfers",
          {
            amount,
            bankCode,
            accountNumber,
            debitAccount: PULSE_DEBIT_ACCOUNT,
            narration: narration || "Veil cash-out",
            reference: ref,
          },
        );
        return NextResponse.json({ ...data, reference: ref });
      }

      /* ── Name enquiry ────────────────────────────────────── */
      case "name-enquiry": {
        const { bankCode: neBank, accountNumber: neAccount } = payload as {
          bankCode: string;
          accountNumber: string;
        };
        const data = await pulseFetch(
          "POST",
          "/api/v1/external-api/transfers/name-enquiry",
          { bankCode: neBank, accountNumber: neAccount },
        );
        return NextResponse.json(data);
      }

      /* ── Transfer status ─────────────────────────────────── */
      case "status": {
        const { reference: statusRef } = payload as { reference: string };
        if (!statusRef) {
          return NextResponse.json(
            { error: "reference is required" },
            { status: 400 },
          );
        }
        const data = await pulseFetch(
          "GET",
          `/api/v1/external-api/transfers/${encodeURIComponent(statusRef)}`,
        );
        return NextResponse.json(data);
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "PulseMFB request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
