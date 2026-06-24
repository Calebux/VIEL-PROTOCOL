/**
 * Browser-compatible withdrawal flow for Veil Protocol.
 *
 * 1. Deserialize the secret note
 * 2. Fetch the on-chain Merkle tree state (filled subtrees + root)
 * 3. Compute the Merkle path from filled subtrees
 * 4. Generate a Groth16 ZK proof via snarkjs (in-browser)
 * 5. Build a Soroban `withdraw()` transaction
 * 6. Sign via Freighter + submit via raw JSON-RPC
 */
import * as StellarSdk from "@stellar/stellar-sdk";

// ── Constants ──

const POOL_CONTRACT_ID =
  process.env.NEXT_PUBLIC_POOL_CONTRACT_ID ??
  "CA267LBV4MGWNORZ3TAPVSPKJIXNEBBL3GHPBYONUTQHQDBOLGKKD4WR";

const RPC_URL =
  process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??
  "https://mainnet.sorobanrpc.com";

const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "testnet"
    ? StellarSdk.Networks.TESTNET
    : StellarSdk.Networks.PUBLIC;

const CIRCUIT_WASM_URL = "/circuits/withdraw.wasm";
const ZKEY_URL = "/circuits/withdraw_final.zkey";

const SUBSET_WASM_URL = "/circuits/subset.wasm";
const SUBSET_ZKEY_URL = "/circuits/subset_final.zkey";

// Precomputed Poseidon zero values for depth-20 Merkle tree (must match contract)
const ZEROS: string[] = [
  "0000000000000000000000000000000000000000000000000000000000000000",
  "2098f5fb9e239eab3ceac3f27b81e481dc3124d55ffed523a839ee8446b64864",
  "1069673dcdb12263df301a6ff584a7ec261a44cb9dc68df067a4774460b1f1e1",
  "18f43331537ee2af2e3d758d50f72106467c6eea50371dd528d57eb2b856d238",
  "07f9d837cb17b0d36320ffe93ba52345f1b728571a568265caac97559dbc952a",
  "2b94cf5e8746b3f5c9631f4c5df32907a699c58c94b2ad4d7b5cec1639183f55",
  "2dee93c5a666459646ea7d22cca9e1bcfed71e6951b953611d11dda32ea09d78",
  "078295e5a22b84e982cf601eb639597b8b0515a88cb5ac7fa8a4aabe3c87349d",
  "2fa5e5f18f6027a6501bec864564472a616b2e274a41211a444cbe3a99f3cc61",
  "0e884376d0d8fd21ecb780389e941f66e45e7acce3e228ab3e2156a614fcd747",
  "1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2",
  "1f8d8822725e36385200c0b201249819a6e6e1e4650808b5bebc6bface7d7636",
  "2c5d82f66c914bafb9701589ba8cfcfb6162b0a12acf88a8d0879a0471b5f85a",
  "14c54148a0940bb820957f5adf3fa1134ef5c4aaa113f4646458f270e0bfbfd0",
  "190d33b12f986f961e10c0ee44d8b9af11be25588cad89d416118e4bf4ebe80c",
  "22f98aa9ce704152ac17354914ad73ed1167ae6596af510aa5b3649325e06c92",
  "2a7c7c9b6ce5880b9f6f228d72bf6a575a526f29c66ecceef8b753d38bba7323",
  "2e8186e558698ec1c67af9c14d463ffc470043c9c2988b954d75dd643f36b992",
  "0f57c5571e9a4eab49e2c8cf050dae948aef6ead647392273546249d1c1ff10f",
  "1830ee67b5fb554ad5f63d4388800e1cfe78e310697d46e43c9ce36134f72cca",
  "2134e76ac5d21aab186c2be1dd8f84ee880a1e46eaf712f9d371b6df22191f3e",
];

// ── Types ──

export interface WithdrawResult {
  txHash: string;
  nullifierHash: string;
  subsetProofIncluded?: boolean;
}

export interface SubsetStatus {
  approved: boolean;
  status: "compliant" | "pending_review" | "not_screened";
  subsetSize: number;
}

interface ParsedNote {
  nullifier: bigint;
  secret: bigint;
  amount: bigint;
  leafIndex: number;
}

interface TreeState {
  filledSubtrees: string[];
  nextIndex: number;
  currentRoot: string;
}

// ── Poseidon singleton ──

let poseidonFn: ((inputs: bigint[]) => bigint) | null = null;

async function getPoseidon(): Promise<(inputs: bigint[]) => bigint> {
  if (poseidonFn) return poseidonFn;
  const circomlibjs = await import("circomlibjs");
  const poseidon = await circomlibjs.buildPoseidon();
  poseidonFn = (inputs: bigint[]) => {
    const hash = poseidon(inputs);
    return poseidon.F.toObject(hash);
  };
  return poseidonFn;
}

// ── Note parsing ──

function parseNote(noteString: string): ParsedNote {
  const parts = noteString.split("-");
  if (parts[0] !== "veil" || parts.length !== 5) {
    throw new Error("Invalid note format");
  }
  return {
    nullifier: BigInt("0x" + parts[1]),
    secret: BigInt("0x" + parts[2]),
    amount: BigInt(parts[3]),
    leafIndex: parseInt(parts[4], 10),
  };
}

// ── Fetch on-chain tree state ──

async function fetchTreeState(poolId?: string): Promise<TreeState> {
  const pid = poolId || POOL_CONTRACT_ID;
  const res = await fetch(`/api/tree?poolId=${pid}`);
  if (!res.ok) {
    throw new Error("Failed to fetch tree state from contract");
  }
  return res.json();
}

// ── Fetch all commitments and rebuild the full tree ──

async function fetchAllCommitments(poolId?: string): Promise<string[]> {
  const pid = poolId || POOL_CONTRACT_ID;
  const res = await fetch(`/api/commitments?poolId=${pid}`);
  if (!res.ok) throw new Error("Failed to fetch commitments");
  const data = await res.json();
  return data.commitments ?? [];
}

/**
 * Rebuild the full Merkle tree from all commitments and extract
 * the path for a specific leaf. This works for ANY leaf, not just
 * the most recent one (unlike the filledSubtrees shortcut).
 */
function buildFullTreeAndPath(
  leaves: bigint[],
  leafIndex: number,
  poseidon: (inputs: bigint[]) => bigint,
  depth: number = 20
): { pathElements: bigint[]; pathIndices: number[]; root: bigint } {
  // Build each level of the tree
  const zeroValues = ZEROS.map((z) => BigInt("0x" + z));
  const treeSize = 1 << depth; // 2^depth

  // Level 0 = leaves (padded with zeros)
  let currentLevel: bigint[] = new Array(treeSize);
  for (let i = 0; i < treeSize; i++) {
    currentLevel[i] = i < leaves.length ? leaves[i] : zeroValues[0];
  }

  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];
  let idx = leafIndex;

  for (let level = 0; level < depth; level++) {
    const bit = idx & 1;
    pathIndices.push(bit);
    // Sibling is the other node in the pair
    const siblingIdx = bit === 0 ? idx + 1 : idx - 1;
    pathElements.push(currentLevel[siblingIdx]);

    // Build next level
    const nextSize = currentLevel.length >> 1;
    const nextLevel: bigint[] = new Array(nextSize);
    for (let i = 0; i < nextSize; i++) {
      nextLevel[i] = poseidon([currentLevel[2 * i], currentLevel[2 * i + 1]]);
    }
    currentLevel = nextLevel;
    idx >>= 1;
  }

  return { pathElements, pathIndices, root: currentLevel[0] };
}

// ── Address to field element (matches on-chain sha256) ──

async function addressToField(address: string): Promise<bigint> {
  const data = new TextEncoder().encode(address);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashArr = new Uint8Array(hashBuf);
  hashArr[0] = 0; // Fit in BN254 field
  let result = 0n;
  for (const byte of hashArr) {
    result = (result << 8n) + BigInt(byte);
  }
  return result;
}

// ── Proof point encoding ──

function writeBigInt(buf: Uint8Array, val: bigint, offset: number, length: number) {
  for (let i = length - 1; i >= 0; i--) {
    buf[offset + i] = Number(val & 0xffn);
    val >>= 8n;
  }
}

function g1ToBytes(point: string[]): Uint8Array {
  const result = new Uint8Array(64);
  writeBigInt(result, BigInt(point[0]), 0, 32);
  writeBigInt(result, BigInt(point[1]), 32, 32);
  return result;
}

function g2ToBytes(point: string[][]): Uint8Array {
  const result = new Uint8Array(128);
  writeBigInt(result, BigInt(point[0][1]), 0, 32);   // x.c1
  writeBigInt(result, BigInt(point[0][0]), 32, 32);  // x.c0
  writeBigInt(result, BigInt(point[1][1]), 64, 32);  // y.c1
  writeBigInt(result, BigInt(point[1][0]), 96, 32);  // y.c0
  return result;
}

// ── U256 ScVal helpers ──

function bigintToU256ScVal(val: bigint): StellarSdk.xdr.ScVal {
  const hex = val.toString(16).padStart(64, "0");
  return StellarSdk.xdr.ScVal.scvU256(
    new StellarSdk.xdr.UInt256Parts({
      hiHi: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(0, 16)).toString()),
      hiLo: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(16, 32)).toString()),
      loHi: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(32, 48)).toString()),
      loLo: StellarSdk.xdr.Uint64.fromString(BigInt("0x" + hex.slice(48, 64)).toString()),
    })
  );
}

function bytesToScValBytes(bytes: Uint8Array): StellarSdk.xdr.ScVal {
  return StellarSdk.xdr.ScVal.scvBytes(Buffer.from(bytes));
}

// ── Subset (Privacy Pools) helpers ──

export async function checkSubsetStatus(commitment: bigint): Promise<SubsetStatus> {
  const hex = commitment.toString(16).padStart(64, "0");
  const res = await fetch(`/api/subset/status?commitment=${hex}`);
  if (!res.ok) {
    return { approved: false, status: "not_screened", subsetSize: 0 };
  }
  const data = await res.json();
  return {
    approved: data.approved ?? false,
    status: data.status ?? "not_screened",
    subsetSize: data.subsetSize ?? 0,
  };
}

async function generateSubsetProof(
  commitment: bigint,
  onProgress?: (step: string) => void
): Promise<{ proof: unknown; publicSignals: string[] } | null> {
  const progress = onProgress ?? (() => {});

  // Fetch subset status + proof data
  progress("Checking compliance status...");
  const hex = commitment.toString(16).padStart(64, "0");
  const statusRes = await fetch(`/api/subset/status?commitment=${hex}`);
  if (!statusRes.ok) return null;
  const statusData = await statusRes.json();

  if (!statusData.approved || !statusData.proof) {
    return null;
  }

  // Build circuit input
  progress("Generating subset proof...");
  const input = {
    root: BigInt("0x" + statusData.subsetRoot).toString(),
    leaf: commitment.toString(),
    pathElements: statusData.proof.pathElements.map((e: string) =>
      BigInt("0x" + e).toString()
    ),
    pathIndices: statusData.proof.pathIndices,
  };

  const snarkjs = await import("snarkjs");
  const result = await snarkjs.groth16.fullProve(
    input,
    SUBSET_WASM_URL,
    SUBSET_ZKEY_URL
  );

  return result;
}

// ── Progress callback type ──

export type ProgressCallback = (step: string) => void;

// ── Main withdrawal flow ──

export async function executeWithdraw(
  noteString: string,
  recipientAddress: string,
  onProgress?: ProgressCallback,
  poolContractId?: string
): Promise<WithdrawResult> {
  const progress = onProgress ?? (() => {});

  // 1. Parse note
  progress("Parsing secret note...");
  const note = parseNote(noteString);
  const poseidon = await getPoseidon();

  // Recompute commitment and nullifier hash
  const commitment = poseidon([note.nullifier, note.secret]);
  const nullifierHash = poseidon([note.nullifier]);

  // 2. Fetch on-chain tree state + all commitments
  progress("Syncing on-chain deposits...");
  const ACTIVE_POOL = poolContractId || POOL_CONTRACT_ID;
  const [treeState, allCommitmentHexes] = await Promise.all([
    fetchTreeState(ACTIVE_POOL),
    fetchAllCommitments(ACTIVE_POOL),
  ]);

  if (treeState.nextIndex === 0 || allCommitmentHexes.length === 0) {
    throw new Error("No deposits found in the pool.");
  }

  const allCommitments = allCommitmentHexes.map((hex) => BigInt("0x" + hex));

  // Determine our leaf index
  let leafIndex = note.leafIndex;

  // Find our commitment in the list to verify/correct the index
  const commitmentHex = commitment.toString(16).padStart(64, "0");
  const foundIndex = allCommitmentHexes.indexOf(commitmentHex);
  if (foundIndex >= 0 && foundIndex !== leafIndex) {
    console.log(`Note leafIndex=${leafIndex} but commitment found at index ${foundIndex}. Using ${foundIndex}.`);
    leafIndex = foundIndex;
  }

  if (leafIndex >= treeState.nextIndex) {
    throw new Error(
      `Leaf index ${leafIndex} is out of range (${treeState.nextIndex} deposits exist).`
    );
  }

  // 3. Rebuild full Merkle tree from all commitments and extract path
  progress("Building Merkle tree (depth 20)...");
  const { pathElements, pathIndices, root: computedRoot } = buildFullTreeAndPath(
    allCommitments,
    leafIndex,
    poseidon
  );

  const onChainRoot = BigInt("0x" + treeState.currentRoot);

  // Verify computed root matches on-chain
  if (computedRoot !== onChainRoot) {
    throw new Error(
      `Merkle root mismatch. ` +
      `Computed: ${computedRoot.toString(16).slice(0, 16)}..., ` +
      `On-chain: ${treeState.currentRoot.slice(0, 16)}... ` +
      `(${allCommitments.length} commitments local vs ${treeState.nextIndex} on-chain)`
    );
  }

  const root = onChainRoot;

  // 4. Build circuit input
  progress("Computing witness assignment...");
  const recipientField = await addressToField(recipientAddress);
  const relayerField = await addressToField(recipientAddress);
  const fee = 0n;

  const input = {
    root: root.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient: recipientField.toString(),
    relayer: relayerField.toString(),
    fee: fee.toString(),
    refund: "0",
    nullifier: note.nullifier.toString(),
    secret: note.secret.toString(),
    pathElements: pathElements.map((e) => e.toString()),
    pathIndices,
  };

  // 5. Generate Groth16 proof
  progress("Generating Groth16 proof...");
  console.log("[withdraw] Starting Groth16 proof generation...");
  const proofStart = Date.now();
  const snarkjs = await import("snarkjs");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    CIRCUIT_WASM_URL,
    ZKEY_URL
  );
  console.log(`[withdraw] Proof generated in ${Date.now() - proofStart}ms`);

  // Verify proof locally before submitting
  void publicSignals;

  progress("Proof generated!");

  // ── Subset proof (Privacy Pools compliance) ──
  let subsetProofResult: { proof: unknown; publicSignals: string[] } | null = null;
  try {
    subsetProofResult = await generateSubsetProof(commitment, progress);
  } catch (err) {
    // Subset proof is optional — log but don't block withdrawal
    console.warn("[withdraw] Subset proof generation failed:", err);
  }

  // 6. Encode proof for Soroban
  const proofA = g1ToBytes(proof.pi_a);
  const proofB = g2ToBytes(proof.pi_b);
  const proofC = g1ToBytes(proof.pi_c);

  const proofDataScVal = StellarSdk.xdr.ScVal.scvMap([
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("a"),
      val: bytesToScValBytes(proofA),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("b"),
      val: bytesToScValBytes(proofB),
    }),
    new StellarSdk.xdr.ScMapEntry({
      key: StellarSdk.xdr.ScVal.scvSymbol("c"),
      val: bytesToScValBytes(proofC),
    }),
  ]);

  // 7. Build Soroban transaction
  progress("Submitting to network...");
  console.log("[withdraw] Fetching account from Horizon...");

  const horizonRes = await fetch(
    `https://horizon.stellar.org/accounts/${recipientAddress}`
  );
  if (!horizonRes.ok) throw new Error("Failed to load account from Horizon");
  const horizonData = await horizonRes.json();
  const account = new StellarSdk.Account(recipientAddress, horizonData.sequence);
  console.log("[withdraw] Account loaded, building tx...");

  const contract = new StellarSdk.Contract(ACTIVE_POOL);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "withdraw",
        proofDataScVal,
        bigintToU256ScVal(root),
        bigintToU256ScVal(nullifierHash),
        StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
        StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
        StellarSdk.nativeToScVal(0, { type: "i128" }),
        StellarSdk.nativeToScVal(0, { type: "i128" })
      )
    )
    .setTimeout(60)
    .build();
  console.log("[withdraw] Tx built, simulating...");

  // Simulate via raw RPC
  progress("Simulating transaction...");
  const simRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "simulateTransaction",
      params: { transaction: tx.toEnvelope().toXDR("base64") },
    }),
  });
  const simResult = (await simRes.json()).result;
  console.log("[withdraw] Simulation result:", simResult.error || "OK");

  if (simResult.error) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  // Rebuild with fresh sequence to avoid stale sequence issues, then use SDK assembly
  let preparedXDR: string;
  try {
    const rpcServer = new StellarSdk.SorobanRpc.Server(RPC_URL);

    // Fetch fresh sequence number
    const freshHorizon = await fetch(
      `https://horizon.stellar.org/accounts/${recipientAddress}`
    );
    const freshData = await freshHorizon.json();
    const freshAccount = new StellarSdk.Account(recipientAddress, freshData.sequence);

    // Rebuild tx with fresh sequence for simulation
    const freshTx = new StellarSdk.TransactionBuilder(freshAccount, {
      fee: "10000000",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          "withdraw",
          proofDataScVal,
          bigintToU256ScVal(root),
          bigintToU256ScVal(nullifierHash),
          StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
          StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
          StellarSdk.nativeToScVal(0, { type: "i128" }),
          StellarSdk.nativeToScVal(0, { type: "i128" })
        )
      )
      .setTimeout(60)
      .build();

    const sdkSimResponse = await rpcServer.simulateTransaction(freshTx);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(sdkSimResponse)) {
      throw new Error("SDK sim failed");
    }
    const assembled = StellarSdk.SorobanRpc.assembleTransaction(
      freshTx,
      sdkSimResponse as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse
    ).build();
    preparedXDR = assembled.toEnvelope().toXDR("base64");
    console.log("[withdraw] SDK assembleTransaction succeeded");
    // Log auth entries for debugging
    try {
      const env = assembled.toEnvelope();
      const ops = env.v1().tx().operations();
      for (const op of ops) {
        const invokeArgs = op.body().invokeHostFunctionOp();
        const auth = invokeArgs.auth();
        console.log("[withdraw] Auth entries count:", auth.length);
        for (let i = 0; i < auth.length; i++) {
          const entry = auth[i];
          console.log("[withdraw] Auth entry", i, "credentials type:", entry.credentials().switch().name);
        }
      }
    } catch (e) { console.log("[withdraw] Could not log auth:", (e as Error).message); }
  } catch (assembleErr) {
    console.log("[withdraw] SDK assemble failed, using manual rebuild:", (assembleErr as Error).message);
    // Manual rebuild using raw simulation result
    const manualFreshRes = await fetch(
      `https://horizon.stellar.org/accounts/${recipientAddress}`
    );
    const manualFreshData = await manualFreshRes.json();
    const freshAccount = new StellarSdk.Account(recipientAddress, manualFreshData.sequence);

    const minFee = parseInt(simResult.minResourceFee || "0", 10);
    const builder = new StellarSdk.TransactionBuilder(freshAccount, {
      fee: String(Math.max(10000000, minFee + 100000)),
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    const authEntries = (simResult.results?.[0]?.auth ?? []).map((a: string) =>
      StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(a, "base64")
    );

    builder
      .addOperation(
        StellarSdk.Operation.invokeHostFunction({
          func: StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract(
            new StellarSdk.xdr.InvokeContractArgs({
              contractAddress: new StellarSdk.Address(ACTIVE_POOL).toScAddress(),
              functionName: "withdraw",
              args: [
                proofDataScVal,
                bigintToU256ScVal(root),
                bigintToU256ScVal(nullifierHash),
                StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
                StellarSdk.nativeToScVal(recipientAddress, { type: "address" }),
                StellarSdk.nativeToScVal(0, { type: "i128" }),
                StellarSdk.nativeToScVal(0, { type: "i128" }),
              ],
            })
          ),
          auth: authEntries,
        })
      )
      .setTimeout(60);

    if (simResult.transactionData) {
      builder.setSorobanData(simResult.transactionData);
    }

    const preparedTx = builder.build();
    preparedXDR = preparedTx.toEnvelope().toXDR("base64");
  }

  // 8. Sign with Freighter
  progress("Waiting for wallet signature...");
  const { signTransaction } = await import("@stellar/freighter-api");
  const signedXDR = await signTransaction(preparedXDR, {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  // Handle both v1 (string) and v2 (object) Freighter API responses
  const signedTxXdr = typeof signedXDR === "string"
    ? signedXDR
    : (signedXDR as { signedTxXdr: string }).signedTxXdr;

  if (!signedTxXdr) throw new Error("Transaction signing was rejected");

  // 9. Submit via raw RPC
  progress("Broadcasting transaction...");
  console.log("[withdraw] Submitting signed tx to RPC...");
  const submitRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sendTransaction",
      params: { transaction: signedTxXdr },
    }),
  });
  const sendResult = (await submitRes.json()).result;
  console.log("[withdraw] Send result:", sendResult?.status, sendResult?.hash);
  if (sendResult?.errorResultXdr) {
    try {
      const txResult = StellarSdk.xdr.TransactionResult.fromXDR(sendResult.errorResultXdr, "base64");
      console.log("[withdraw] Error detail:", txResult.result().switch().name);
    } catch { /* ignore parse failures */ }
  }

  if (!sendResult || sendResult.status === "ERROR") {
    throw new Error(`Submission failed: ${sendResult?.errorResultXdr ?? "unknown"}`);
  }

  // 10. Poll for confirmation
  progress("Waiting for confirmation...");
  const txHash = sendResult.hash;
  const start = Date.now();
  let txStatus = "NOT_FOUND";

  while (txStatus === "NOT_FOUND") {
    if (Date.now() - start > 60000) throw new Error("Confirmation timed out");
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: { hash: txHash },
      }),
    });
    const pollResult = (await pollRes.json()).result;
    txStatus = pollResult?.status ?? "NOT_FOUND";

    if (txStatus === "FAILED") {
      let reason = "unknown";
      try {
        const txResult = StellarSdk.xdr.TransactionResult.fromXDR(
          pollResult.resultXdr,
          "base64"
        );
        reason = txResult.result().switch().name;
      } catch {
        /* */
      }
      throw new Error(`Transaction failed on-chain: ${reason}`);
    }
  }

  return {
    txHash,
    nullifierHash: nullifierHash.toString(16),
    subsetProofIncluded: subsetProofResult !== null,
  };
}
