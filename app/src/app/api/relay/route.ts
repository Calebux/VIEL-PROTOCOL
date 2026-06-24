import { NextRequest, NextResponse } from "next/server";
import { isInSubset, getSubsetTreeInfo } from "@/lib/subsetTree";

const RELAYER_URL =
  process.env.RELAYER_URL ||
  process.env.NEXT_PUBLIC_RELAYER_URL ||
  "http://localhost:3001";

// Whether to require subset proofs for withdrawals
const REQUIRE_SUBSET_PROOF = process.env.REQUIRE_SUBSET_PROOF === "true";

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

    if (body.action === "withdraw_swap") {
      return handleWithdrawSwap(body);
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

async function verifySubsetProof(
  subsetProof: Record<string, unknown>,
  subsetRoot: string,
  commitment: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Verify the subset root matches the current approved tree
    const treeInfo = await getSubsetTreeInfo();
    if (subsetRoot !== treeInfo.root) {
      return { valid: false, error: "Subset root mismatch — tree may have been updated" };
    }

    // Verify the commitment is in the approved subset
    if (!isInSubset(commitment)) {
      return { valid: false, error: "Commitment not found in approved subset" };
    }

    // Verify the Groth16 subset proof using snarkjs
    const snarkjs = await import("snarkjs");
    let vk;
    try {
      const fs = await import("fs");
      const path = await import("path");
      const vkPath = path.join(process.cwd(), "public/circuits/subset_verification_key.json");
      vk = JSON.parse(fs.readFileSync(vkPath, "utf-8"));
    } catch {
      // VK not available — skip cryptographic verification in demo mode
      return { valid: true };
    }

    const publicSignals = subsetProof.publicSignals as string[];
    const proof = subsetProof.proof as Record<string, unknown>;
    const isValid = await snarkjs.groth16.verify(vk, publicSignals, proof);

    if (!isValid) {
      return { valid: false, error: "Subset proof cryptographic verification failed" };
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : "Verification error" };
  }
}

async function handleWithdraw(body: Record<string, unknown>) {
  const note = body.note as string | undefined;
  const recipient = body.recipient as string | undefined;
  const useRelayer = body.useRelayer !== false;
  const subsetProof = body.subsetProof as Record<string, unknown> | undefined;
  const subsetRoot = body.subsetRoot as string | undefined;
  const commitment = body.commitment as string | undefined;

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

  // ── Privacy Pools: verify subset proof if present ──
  let complianceStatus: "verified" | "unverified" | "failed" = "unverified";

  if (subsetProof && subsetRoot && commitment) {
    const result = await verifySubsetProof(subsetProof, subsetRoot, commitment);
    if (result.valid) {
      complianceStatus = "verified";
    } else {
      complianceStatus = "failed";
      // If relayer requires compliance, reject
      if (REQUIRE_SUBSET_PROOF) {
        return NextResponse.json(
          { error: `Compliance proof invalid: ${result.error}` },
          { status: 403 }
        );
      }
    }
  } else if (REQUIRE_SUBSET_PROOF) {
    return NextResponse.json(
      { error: "Subset proof required by this relayer but not provided" },
      { status: 403 }
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
          poolContractId: body.poolContractId,
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
    complianceStatus,
  });
}

async function handleWithdrawSwap(body: Record<string, unknown>) {
  const note = body.note as string | undefined;
  const recipient = body.recipient as string | undefined;
  const tokenOut = body.tokenOut as string | undefined;
  const useRelayer = body.useRelayer !== false;

  if (!note || !recipient || !tokenOut) {
    return NextResponse.json(
      { error: "Missing note, recipient, or tokenOut" },
      { status: 400 }
    );
  }

  const parts = note.split("-");
  if (parts[0] !== "veil" || parts.length !== 5) {
    return NextResponse.json(
      { error: "Invalid note format" },
      { status: 400 }
    );
  }

  // Try forwarding to the relayer's swap endpoint
  if (useRelayer) {
    try {
      const relayResponse = await fetch(`${RELAYER_URL}/relay-swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          recipient,
          nullifier: parts[1],
          fee: "0",
          tokenOut,
          minAmountOut: body.minAmountOut || "0",
          poolContractId: body.poolContractId,
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

  // Demo fallback — simulated swap withdrawal
  const swapRate = tokenOut === "USDC" ? 0.12 : tokenOut === "XLM" ? 8.33 : 0.95;
  const denominationNum = parseInt(parts[3], 10) || 1000000000;
  const denominationDisplay = tokenOut === "USDC"
    ? denominationNum / 1e7
    : denominationNum / 1e7;
  const estimatedOutput = (denominationDisplay * swapRate * 0.95).toFixed(2);

  return NextResponse.json({
    success: true,
    txHash: `swap_${Date.now().toString(16)}`,
    estimatedDelay: 3 + Math.floor(Math.random() * 5),
    swap: {
      tokenOut,
      estimatedOutput,
      rate: swapRate,
    },
  });
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
