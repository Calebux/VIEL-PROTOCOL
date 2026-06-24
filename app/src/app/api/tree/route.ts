import { NextRequest, NextResponse } from "next/server";
import * as StellarSdk from "@stellar/stellar-sdk";

export const dynamic = "force-dynamic";

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
  "https://mainnet.sorobanrpc.com";

const DEFAULT_POOL =
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ??
  "CA267LBV4MGWNORZ3TAPVSPKJIXNEBBL3GHPBYONUTQHQDBOLGKKD4WR";

const TREE_DEPTH = 20;

function u256ToHex(u256: StellarSdk.xdr.UInt256Parts): string {
  return [
    u256.hiHi().toBigInt(),
    u256.hiLo().toBigInt(),
    u256.loHi().toBigInt(),
    u256.loLo().toBigInt(),
  ]
    .map((v) => v.toString(16).padStart(16, "0"))
    .join("");
}

function makeStorageKey(poolContractId: string, key: StellarSdk.xdr.ScVal): string {
  const contractAddr = new StellarSdk.Address(poolContractId);
  const ledgerKey = StellarSdk.xdr.LedgerKey.contractData(
    new StellarSdk.xdr.LedgerKeyContractData({
      contract: contractAddr.toScAddress(),
      key,
      durability: StellarSdk.xdr.ContractDataDurability.persistent(),
    })
  );
  return ledgerKey.toXDR("base64");
}

/**
 * GET /api/tree?poolId=C... — Returns the on-chain Merkle tree state in a single
 * batched RPC call for consistency (all data from the same ledger).
 */
export async function GET(req: NextRequest) {
  try {
    const poolId = req.nextUrl.searchParams.get("poolId") || DEFAULT_POOL;

    // Build all storage keys for a single batched getLedgerEntries call
    const keys: string[] = [];
    const keyLabels: string[] = [];

    // 20 FilledSubtree keys
    for (let i = 0; i < TREE_DEPTH; i++) {
      keys.push(
        makeStorageKey(
          poolId,
          StellarSdk.xdr.ScVal.scvVec([
            StellarSdk.xdr.ScVal.scvSymbol("FilledSubtree"),
            StellarSdk.xdr.ScVal.scvU32(i),
          ])
        )
      );
      keyLabels.push(`FS${i}`);
    }

    // NextIndex
    keys.push(
      makeStorageKey(
        poolId,
        StellarSdk.xdr.ScVal.scvVec([
          StellarSdk.xdr.ScVal.scvSymbol("NextIndex"),
        ])
      )
    );
    keyLabels.push("NextIndex");

    // CurrentRootIndex
    keys.push(
      makeStorageKey(
        poolId,
        StellarSdk.xdr.ScVal.scvVec([
          StellarSdk.xdr.ScVal.scvSymbol("CurrentRootIndex"),
        ])
      )
    );
    keyLabels.push("CurrentRootIndex");

    // Single batched RPC call
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLedgerEntries",
        params: { keys },
      }),
      cache: "no-store",
    });
    const json = await res.json();
    const entries = json.result?.entries ?? [];

    // Parse results — entries come back in the same order as keys
    const values = new Map<string, StellarSdk.xdr.ScVal>();
    for (let i = 0; i < entries.length; i++) {
      const data = StellarSdk.xdr.LedgerEntryData.fromXDR(
        entries[i].xdr,
        "base64"
      );
      // Match by key XDR
      const entryKey = data.contractData().key().toXDR("base64");
      // Find which label this matches
      for (let j = 0; j < keys.length; j++) {
        const expectedKeyData = StellarSdk.xdr.LedgerKey.fromXDR(keys[j], "base64");
        const expectedKeyVal = expectedKeyData.contractData().key().toXDR("base64");
        if (entryKey === expectedKeyVal) {
          values.set(keyLabels[j], data.contractData().val());
          break;
        }
      }
    }

    // Extract filled subtrees
    const filledSubtrees: string[] = [];
    for (let i = 0; i < TREE_DEPTH; i++) {
      const val = values.get(`FS${i}`);
      filledSubtrees.push(val ? u256ToHex(val.u256()) : "0".repeat(64));
    }

    // Extract NextIndex
    const nextIndexVal = values.get("NextIndex");
    const nextIndex = nextIndexVal ? (nextIndexVal.value() as number) : 0;

    // Extract CurrentRootIndex, then fetch the root
    const criVal = values.get("CurrentRootIndex");
    const currentRootIndex = criVal ? (criVal.value() as number) : 0;

    // Now fetch the root at that index (separate call since we needed CRI first)
    const rootKey = makeStorageKey(
      poolId,
      StellarSdk.xdr.ScVal.scvVec([
        StellarSdk.xdr.ScVal.scvSymbol("Root"),
        StellarSdk.xdr.ScVal.scvU32(currentRootIndex),
      ])
    );
    const rootRes = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLedgerEntries",
        params: { keys: [rootKey] },
      }),
      cache: "no-store",
    });
    const rootJson = await rootRes.json();
    let currentRoot = "0".repeat(64);
    if (rootJson.result?.entries?.length) {
      const rootData = StellarSdk.xdr.LedgerEntryData.fromXDR(
        rootJson.result.entries[0].xdr,
        "base64"
      );
      currentRoot = u256ToHex(rootData.contractData().val().u256());
    }

    return NextResponse.json({
      filledSubtrees,
      nextIndex,
      currentRoot,
      currentRootIndex,
      contractId: poolId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
