import { NextRequest, NextResponse } from "next/server";

const RELAYER_URL =
  process.env.RELAYER_URL ||
  process.env.NEXT_PUBLIC_RELAYER_URL ||
  "http://localhost:3002";

/**
 * POST /api/relay — Handles deposit note generation and withdrawal relay.
 *
 * Deposits:
 *   Generates a secret note in the SDK-compatible format:
 *   veil-<nullifier>-<secret>-<denomination>-<leafIndex>
 *   In production the client builds + signs the deposit TX via Freighter.
 *
 * Withdrawals:
 *   Forwards the withdrawal request to the relayer service, which submits
 *   the on-chain TX. The relayer adds random delays for timing decorrelation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "deposit") {
      return handleDeposit(body);
    }

    if (body.action === "withdraw") {
      return handleWithdraw(body);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function handleDeposit(body: Record<string, unknown>) {
  const nullifier = randomHex(32);
  const secret = randomHex(32);
  const denomination = (body.denomination as string) || "1000000000";
  const noteString = `veil-${nullifier}-${secret}-${denomination}-0`;

  // Generate viewing key if requested
  let viewingKey: string | undefined;
  if (body.enableViewingKey) {
    viewingKey = `vk-${randomHex(24)}`;
  }

  return NextResponse.json({
    success: true,
    noteString,
    txHash: `deposit_${Date.now().toString(16)}`,
    leafIndex: 0,
    viewingKey,
  });
}

async function handleWithdraw(body: Record<string, unknown>) {
  const note = body.note as string | undefined;
  const recipient = body.recipient as string | undefined;
  const useRelayer = body.useRelayer !== false;

  if (!note || !recipient) {
    return NextResponse.json(
      { error: "Missing note or recipient" },
      { status: 400 }
    );
  }

  // Validate note format
  const parts = note.split("-");
  if (parts[0] !== "veil" || parts.length !== 5) {
    return NextResponse.json(
      { error: "Invalid note format — must be veil-<nullifier>-<secret>-<denomination>-<leafIndex>" },
      { status: 400 }
    );
  }

  // Try forwarding to the relayer service
  if (useRelayer) {
    try {
      const relayResponse = await fetch(`${RELAYER_URL}/relay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          recipient,
          nullifier: parts[1],
          fee: "0",
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (relayResponse.ok) {
        const data = await relayResponse.json();
        return NextResponse.json(data);
      }
    } catch {
      // Relayer not available — fall through to demo mode
    }
  }

  // Demo fallback — simulated withdrawal with random delay
  return NextResponse.json({
    success: true,
    txHash: `withdraw_${Date.now().toString(16)}`,
    estimatedDelay: 3 + Math.floor(Math.random() * 5),
  });
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
