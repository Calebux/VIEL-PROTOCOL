import { NextRequest, NextResponse } from "next/server";
import { getPoolStats } from "@/lib/stellar";

/**
 * GET /api/tree — Live pool stats from the Soroban contract.
 */
export async function GET(req: NextRequest) {
  const contractId = req.nextUrl.searchParams.get("contract") || undefined;

  try {
    const stats = await getPoolStats(contractId);
    return NextResponse.json({
      ...stats,
      leafCount: stats.depositCount,
      lastUpdated: Date.now(),
    });
  } catch {
    // Contract not deployed or RPC unavailable — return fallback
    return NextResponse.json({
      contractId: contractId || "not_configured",
      leafCount: 0,
      depositCount: 0,
      denomination: "0",
      denominationXLM: 0,
      lastRoot: "0",
      network: "testnet",
      lastUpdated: Date.now(),
    });
  }
}
