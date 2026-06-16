import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { DelayQueue, type QueueItem } from "./queue";
import { submitWithdrawal, type WithdrawParams } from "./submit";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = parseInt(process.env.RELAYER_PORT || "3001", 10);
const FEE_BPS = parseInt(process.env.RELAYER_FEE_BPS || "50", 10);

const config = {
  rpcUrl: process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  networkPassphrase:
    process.env.STELLAR_NETWORK === "mainnet"
      ? "Public Global Stellar Network ; September 2015"
      : "Test SDF Network ; September 2015",
  poolContractId: process.env.POOL_CONTRACT_ID || "",
  signerSecret: process.env.RELAYER_SECRET_KEY || "",
};

// Withdrawal results indexed by nullifier hash
const results = new Map<string, { txHash?: string; error?: string; status: string }>();

// Delay queue with random anti-correlation delay
const queue = new DelayQueue(
  async (item: QueueItem) => {
    const params = item.data as WithdrawParams;
    console.log(`[relayer] Processing withdrawal: ${item.id}`);

    try {
      const txHash = await submitWithdrawal(params, config);
      results.set(params.nullifierHash, { txHash, status: "confirmed" });
      console.log(`[relayer] Withdrawal confirmed: ${txHash}`);
      return txHash;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.set(params.nullifierHash, { error, status: "failed" });
      console.error(`[relayer] Withdrawal failed: ${error}`);
      throw err;
    }
  },
  // Shorter delays for testnet (5s–30s)
  process.env.NODE_ENV === "production" ? 30_000 : 5_000,
  process.env.NODE_ENV === "production" ? 300_000 : 30_000
);

/**
 * POST /relay — Submit a withdrawal request
 */
app.post("/relay", (req, res) => {
  const { proofA, proofB, proofC, root, nullifierHash, recipient, fee } =
    req.body as WithdrawParams;

  // Validate required fields
  if (!proofA || !proofB || !proofC || !root || !nullifierHash || !recipient) {
    res.status(400).json({ success: false, error: "Missing required fields" });
    return;
  }

  // Check for duplicate
  if (results.has(nullifierHash)) {
    const existing = results.get(nullifierHash)!;
    if (existing.status === "confirmed") {
      res.json({ success: true, txHash: existing.txHash });
      return;
    }
  }

  // Add to delay queue
  const item = queue.add(nullifierHash, {
    proofA,
    proofB,
    proofC,
    root,
    nullifierHash,
    recipient,
    fee: fee || "0",
  });

  results.set(nullifierHash, { status: "pending" });

  const estimatedDelay = Math.round((item.executeAt - Date.now()) / 1000);

  res.json({
    success: true,
    queuePosition: 1,
    estimatedDelay,
    message: `Withdrawal queued. Estimated processing in ${estimatedDelay}s.`,
  });
});

/**
 * GET /status/:nullifierHash — Check withdrawal status
 */
app.get("/status/:nullifierHash", (req, res) => {
  const { nullifierHash } = req.params;
  const result = results.get(nullifierHash);

  if (!result) {
    res.status(404).json({ status: "not_found" });
    return;
  }

  res.json(result);
});

/**
 * GET /info — Relayer information
 */
app.get("/info", (_req, res) => {
  res.json({
    feeBps: FEE_BPS,
    poolContractId: config.poolContractId,
    supportedDenominations: ["100000000", "1000000000", "10000000000"],
    network: process.env.STELLAR_NETWORK || "testnet",
  });
});

/**
 * GET /tree — Return known deposit commitments for SDK tree sync.
 * Tracks deposits added via relay or reported externally.
 */
const depositLeaves: string[] = [];

app.get("/tree", (_req, res) => {
  res.json({ leaves: depositLeaves, count: depositLeaves.length });
});

app.post("/tree/add", (req, res) => {
  const { commitment } = req.body;
  if (!commitment) {
    res.status(400).json({ error: "Missing commitment" });
    return;
  }
  depositLeaves.push(commitment);
  res.json({ success: true, index: depositLeaves.length - 1 });
});

/**
 * GET /health — Health check
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

// Start
queue.start();
app.listen(PORT, () => {
  console.log(`[relayer] Veil relayer running on :${PORT}`);
  console.log(`[relayer] Pool contract: ${config.poolContractId}`);
  console.log(`[relayer] Fee: ${FEE_BPS} bps`);
});
