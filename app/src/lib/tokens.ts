/**
 * Supported tokens for the Veil shielded pool.
 *
 * The pool contract is token-agnostic — each pool instance is initialized
 * with a specific SAC token address. We deploy one pool per token.
 */

export interface SupportedToken {
  symbol: string;
  name: string;
  decimals: number;
  /** Stellar Asset Contract ID */
  tokenId: string;
  /** Pool contract ID for this token */
  poolId: string;
  /** Denomination in stroops/smallest unit */
  denomination: string;
  /** Human-readable denomination */
  denominationDisplay: string;
  /** Icon color for UI */
  color: string;
  bgColor: string;
}

export const SUPPORTED_TOKENS: SupportedToken[] = [
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    decimals: 7,
    tokenId:
      process.env.NEXT_PUBLIC_XLM_TOKEN_ID ||
      "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    poolId:
      process.env.NEXT_PUBLIC_XLM_POOL_ID ||
      process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ||
      "",
    denomination: "1000000000", // 100 XLM
    denominationDisplay: "100 XLM",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 7,
    tokenId:
      process.env.NEXT_PUBLIC_USDC_TOKEN_ID ||
      // Testnet USDC SAC — will be set after deployment
      "",
    poolId:
      process.env.NEXT_PUBLIC_USDC_POOL_ID ||
      // Will be set after deploying a USDC pool
      "",
    denomination: "1000000000", // 100 USDC (7 decimals)
    denominationDisplay: "100 USDC",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
];

export function getToken(symbol: string): SupportedToken | undefined {
  return SUPPORTED_TOKENS.find((t) => t.symbol === symbol);
}

export function getActiveTokens(): SupportedToken[] {
  // Only show tokens that have a pool deployed
  return SUPPORTED_TOKENS.filter((t) => t.poolId);
}
