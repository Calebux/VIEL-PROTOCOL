import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DEFAULT_POOL =
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ??
  "CA267LBV4MGWNORZ3TAPVSPKJIXNEBBL3GHPBYONUTQHQDBOLGKKD4WR";

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
  "https://mainnet.sorobanrpc.com";

// File-based commitment store per pool (survives RPC event pruning)
function storePath(poolId: string): string {
  // Sanitize poolId for filename
  const safe = poolId.replace(/[^A-Za-z0-9]/g, "");
  return path.join(process.cwd(), `.commitments-${safe}.json`);
}

function readStore(poolId: string): string[] {
  try {
    const p = storePath(poolId);
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
  } catch { /* corrupted file — start fresh */ }
  return [];
}

function writeStore(poolId: string, commitments: string[]) {
  fs.writeFileSync(storePath(poolId), JSON.stringify(commitments, null, 2));
}

/**
 * Fetch deposit commitments from on-chain events (if still in RPC window).
 */
async function fetchOnChainCommitments(poolContractId: string): Promise<string[]> {
  const healthRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
  });
  const healthJson = await healthRes.json();
  const startLedger = healthJson.result?.oldestLedger;
  if (!startLedger) return [];

  const commitments: string[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, unknown> = {
      filters: [{ type: "contract", contractIds: [poolContractId] }],
      pagination: { limit: 100, ...(cursor ? { cursor } : {}) },
    };
    if (!cursor) params.startLedger = startLedger;

    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getEvents", params }),
    });
    const json = await res.json();
    if (json.error) break;

    const events = json.result?.events ?? [];

    for (const evt of events) {
      if (!evt.inSuccessfulContractCall) continue;
      const isDeposit = evt.topic?.some(
        (t: string) => t === "AAAADwAAAA1kZXBvc2l0X2V2ZW50AAAA"
      );
      if (!isDeposit) continue;

      const raw = Buffer.from(evt.value, "base64");
      let u256Offset = -1;
      for (let i = 0; i < raw.length - 36; i++) {
        if (raw[i] === 0 && raw[i + 1] === 0 && raw[i + 2] === 0 && raw[i + 3] === 0x0b) {
          u256Offset = i + 4;
          break;
        }
      }
      if (u256Offset >= 0 && u256Offset + 32 <= raw.length) {
        commitments.push(raw.subarray(u256Offset, u256Offset + 32).toString("hex"));
      }
    }

    hasMore = events.length >= 100;
    if (hasMore) cursor = events[events.length - 1].id;
  }

  return commitments;
}

/**
 * GET /api/commitments — Returns merged commitment list (local store + on-chain events).
 */
export async function GET(req: NextRequest) {
  try {
    const poolId = req.nextUrl.searchParams.get("poolId") || DEFAULT_POOL;
    const stored = readStore(poolId);
    const onChain = await fetchOnChainCommitments(poolId);

    // Merge: stored first (preserves order), then any new on-chain ones
    const seen = new Set(stored);
    const merged = [...stored];
    for (const c of onChain) {
      if (!seen.has(c)) {
        merged.push(c);
        seen.add(c);
      }
    }

    // Persist merged list
    if (merged.length > stored.length) {
      writeStore(poolId, merged);
    }

    return NextResponse.json({ commitments: merged });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commitments — Store a new commitment after a successful deposit.
 * Body: { commitment: "hex string" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const commitment = body?.commitment;

    if (!commitment || typeof commitment !== "string" || !/^[0-9a-f]{1,64}$/i.test(commitment)) {
      return NextResponse.json({ error: "Invalid commitment hex" }, { status: 400 });
    }

    const poolId = body?.poolId || DEFAULT_POOL;
    const normalized = commitment.toLowerCase().padStart(64, "0");
    const stored = readStore(poolId);

    if (!stored.includes(normalized)) {
      stored.push(normalized);
      writeStore(poolId, stored);
    }

    return NextResponse.json({ ok: true, total: stored.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
