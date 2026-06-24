export interface Corridor {
  id: string;
  from: { currency: string; country: string; flag: string };
  to: { currency: string; country: string; flag: string };
  rate: number;         // 1 from = rate to
  feePct: number;       // e.g. 0.5 for 0.5%
  anchorIn: string;     // simulated on-ramp partner
  anchorOut: string;    // simulated off-ramp partner
  estimatedMinutes: number;
}

const CORRIDORS: Corridor[] = [
  {
    id: "usd-mxn",
    from: { currency: "USD", country: "United States", flag: "🇺🇸" },
    to: { currency: "MXN", country: "Mexico", flag: "🇲🇽" },
    rate: 17.2,
    feePct: 0.5,
    anchorIn: "MoneyGram",
    anchorOut: "Bitso",
    estimatedMinutes: 3,
  },
  {
    id: "usd-php",
    from: { currency: "USD", country: "United States", flag: "🇺🇸" },
    to: { currency: "PHP", country: "Philippines", flag: "🇵🇭" },
    rate: 56.5,
    feePct: 0.5,
    anchorIn: "Wise",
    anchorOut: "Coins.ph",
    estimatedMinutes: 4,
  },
  {
    id: "eur-ngn",
    from: { currency: "EUR", country: "Europe", flag: "🇪🇺" },
    to: { currency: "NGN", country: "Nigeria", flag: "🇳🇬" },
    rate: 1750,
    feePct: 0.75,
    anchorIn: "N26",
    anchorOut: "Flutterwave",
    estimatedMinutes: 5,
  },
  {
    id: "gbp-kes",
    from: { currency: "GBP", country: "United Kingdom", flag: "🇬🇧" },
    to: { currency: "KES", country: "Kenya", flag: "🇰🇪" },
    rate: 168,
    feePct: 0.5,
    anchorIn: "Revolut",
    anchorOut: "M-Pesa",
    estimatedMinutes: 3,
  },
];

export function getCorridors(): Corridor[] {
  return CORRIDORS;
}

export function getCorridor(id: string): Corridor | undefined {
  return CORRIDORS.find((c) => c.id === id);
}

export interface RemittanceBreakdown {
  senderAmount: number;
  fee: number;
  netAmount: number;         // after fee
  exchangeRate: number;
  receiveAmount: number;     // in target currency
  receiveCurrency: string;
  intermediateToken: string; // "USDC"
  networkFee: number;        // flat Stellar fee estimate in sender currency
}

export function calculateRemittance(
  corridorId: string,
  senderAmount: number
): RemittanceBreakdown | null {
  const corridor = getCorridor(corridorId);
  if (!corridor) return null;

  const fee = senderAmount * (corridor.feePct / 100);
  const networkFee = 0.01; // ~0.01 USD equivalent Stellar fee
  const netAmount = Math.max(0, senderAmount - fee - networkFee);
  const receiveAmount = Math.round(netAmount * corridor.rate * 100) / 100;

  return {
    senderAmount,
    fee: Math.round(fee * 100) / 100,
    netAmount: Math.round(netAmount * 100) / 100,
    exchangeRate: corridor.rate,
    receiveAmount,
    receiveCurrency: corridor.to.currency,
    intermediateToken: "USDC",
    networkFee,
  };
}
