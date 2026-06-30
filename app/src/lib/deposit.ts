/**
 * Browser-compatible deposit flow for Veil Protocol.
 *
 * Uses the Stellar SDK for transaction building/simulation/assembly,
 * but falls back to raw JSON-RPC for any step that hits
 * "Bad union switch" XDR parsing errors (protocol 26 incompatibility).
 */
import * as StellarSdk from "@stellar/stellar-sdk";

// ── Constants ──

const FR_ORDER =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

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

// ── Types ──

export interface DepositResult {
  noteString: string;
  txHash: string;
  leafIndex: number;
  commitment: string;
}

// ── Helpers ──

function randomFieldElement(): bigint {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let val = 0n;
  for (const byte of buf) {
    val = (val << 8n) + BigInt(byte);
  }
  return val % FR_ORDER;
}

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

function bigintToScVal(val: bigint): StellarSdk.xdr.ScVal {
  const hex = val.toString(16).padStart(64, "0");
  const hiHi = BigInt("0x" + hex.slice(0, 16));
  const hiLo = BigInt("0x" + hex.slice(16, 32));
  const loHi = BigInt("0x" + hex.slice(32, 48));
  const loLo = BigInt("0x" + hex.slice(48, 64));

  return StellarSdk.xdr.ScVal.scvU256(
    new StellarSdk.xdr.UInt256Parts({
      hiHi: StellarSdk.xdr.Uint64.fromString(hiHi.toString()),
      hiLo: StellarSdk.xdr.Uint64.fromString(hiLo.toString()),
      loHi: StellarSdk.xdr.Uint64.fromString(loHi.toString()),
      loLo: StellarSdk.xdr.Uint64.fromString(loLo.toString()),
    })
  );
}

function serializeNote(
  nullifier: bigint,
  secret: bigint,
  amount: bigint,
  leafIndex: number
): string {
  return ["veil", nullifier.toString(16), secret.toString(16), amount.toString(), leafIndex.toString()].join("-");
}

// ── Query leaf index from contract ──

async function getNextLeafIndex(poolId?: string): Promise<number> {
  try {
    const pid = poolId || POOL_CONTRACT_ID;
    const res = await fetch(`/api/tree?poolId=${pid}`);
    if (res.ok) {
      const data = await res.json();
      return data.nextIndex ?? 0;
    }
  } catch { /* fallback below */ }

  // Fallback: call contract directly via simulation
  const contract = new StellarSdk.Contract(poolId || POOL_CONTRACT_ID);
  const source = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
  const dummyAccount = new StellarSdk.Account(source, "0");
  const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call("get_next_index"))
    .setTimeout(30)
    .build();

  const simRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "simulateTransaction",
      params: { transaction: tx.toEnvelope().toXDR("base64") },
    }),
  });
  const json = await simRes.json();
  const xdr = json.result?.results?.[0]?.xdr;
  if (xdr) {
    const scval = StellarSdk.xdr.ScVal.fromXDR(xdr, "base64");
    return scval.value() as number;
  }
  return 0;
}

// ── Main deposit flow ──

export async function executeDeposit(
  senderAddress: string,
  amount: bigint,
  poolContractId?: string
): Promise<DepositResult> {
  const ACTIVE_POOL = poolContractId || POOL_CONTRACT_ID;
  // 0. Get the leaf index our deposit will occupy
  let leafIndex = await getNextLeafIndex(ACTIVE_POOL);

  // 1. Generate note secrets + Poseidon commitment
  const nullifier = randomFieldElement();
  const secret = randomFieldElement();
  const poseidon = await getPoseidon();
  const commitment = poseidon([nullifier, secret]);

  const contract = new StellarSdk.Contract(ACTIVE_POOL);
  const commitmentScVal = bigintToScVal(commitment);

  // 2. Load account — try SDK first, fall back to Horizon REST
  const server = new StellarSdk.SorobanRpc.Server(RPC_URL);
  let account: StellarSdk.Account;
  try {
    const sdkAccount = await server.getAccount(senderAddress);
    account = new StellarSdk.Account(senderAddress, sdkAccount.sequenceNumber());
  } catch (e) {
    if (e instanceof Error && e.message.includes("union switch")) {
      const res = await fetch(`https://horizon.stellar.org/accounts/${senderAddress}`);
      if (!res.ok) {
        throw new Error(
          res.status === 404
            ? "Account not found on testnet. Use the Friendbot button to fund it first."
            : `Failed to load account: ${res.status}`
        );
      }
      const data = await res.json();
      account = new StellarSdk.Account(senderAddress, data.sequence);
    } else {
      throw e;
    }
  }

  // 3. Build transaction for simulation
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "10000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        "deposit",
        StellarSdk.nativeToScVal(senderAddress, { type: "address" }),
        commitmentScVal
      )
    )
    .setTimeout(60)
    .build();

  // 4. Simulate + assemble — try SDK first (handles auth correctly), fallback to raw
  let preparedXDR: string;
  try {
    const simResponse = await server.simulateTransaction(tx);
    if (StellarSdk.SorobanRpc.Api.isSimulationError(simResponse)) {
      throw new Error(
        `Simulation failed: ${(simResponse as StellarSdk.SorobanRpc.Api.SimulateTransactionErrorResponse).error}`
      );
    }
    const assembled = StellarSdk.SorobanRpc.assembleTransaction(
      tx,
      simResponse as StellarSdk.SorobanRpc.Api.SimulateTransactionSuccessResponse
    ).build();
    preparedXDR = assembled.toEnvelope().toXDR("base64");
  } catch (e) {
    if (e instanceof Error && e.message.includes("union switch")) {
      // SDK can't parse protocol 26 responses — do it manually via raw RPC
      const simRes = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "simulateTransaction",
          params: { transaction: tx.toEnvelope().toXDR("base64") },
        }),
      });
      const simResult = (await simRes.json()).result;
      if (simResult.error) {
        throw new Error(`Simulation failed: ${simResult.error}`);
      }

      // Rebuild with fresh sequence, sorobanData, and auth
      const freshRes = await fetch(`https://horizon.stellar.org/accounts/${senderAddress}`);
      const freshData = await freshRes.json();
      const freshAccount = new StellarSdk.Account(senderAddress, freshData.sequence);

      const minFee = parseInt(simResult.minResourceFee || "0", 10);

      const builder = new StellarSdk.TransactionBuilder(freshAccount, {
        fee: String(Math.max(10000000, minFee + 100000)),
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      // Build the invoke operation with auth from simulation baked in
      const authEntries = (simResult.results?.[0]?.auth ?? []).map((a: string) =>
        StellarSdk.xdr.SorobanAuthorizationEntry.fromXDR(a, "base64")
      );

      const invokeOp = StellarSdk.Operation.invokeHostFunction({
        func: StellarSdk.xdr.HostFunction.hostFunctionTypeInvokeContract(
          new StellarSdk.xdr.InvokeContractArgs({
            contractAddress: new StellarSdk.Address(ACTIVE_POOL).toScAddress(),
            functionName: "deposit",
            args: [
              StellarSdk.nativeToScVal(senderAddress, { type: "address" }),
              commitmentScVal,
            ],
          })
        ),
        auth: authEntries,
      });

      builder.addOperation(invokeOp).setTimeout(60);

      if (simResult.transactionData) {
        builder.setSorobanData(simResult.transactionData);
      }

      const rebuilt = builder.build();
      preparedXDR = rebuilt.toEnvelope().toXDR("base64");
    } else {
      throw e;
    }
  }

  // 5. Sign with embedded keypair
  const { signTransactionXdr } = await import("@/lib/noteStore");
  const signedTxXdr = signTransactionXdr(preparedXDR, NETWORK_PASSPHRASE);

  // 6. Submit via raw RPC
  const submitRes = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "sendTransaction",
      params: { transaction: signedTxXdr },
    }),
  });
  const sendResult = (await submitRes.json()).result;

  if (!sendResult || sendResult.status === "ERROR") {
    throw new Error(
      `Transaction submission failed: ${sendResult?.errorResultXdr ?? "unknown"}`
    );
  }

  // 7. Poll for confirmation via raw RPC
  const txHash = sendResult.hash;
  const start = Date.now();
  let txStatus = "NOT_FOUND";
  let resultXdr = "";

  while (txStatus === "NOT_FOUND") {
    if (Date.now() - start > 60000) {
      throw new Error("Transaction confirmation timed out after 60s");
    }
    await new Promise((r) => setTimeout(r, 2000));

    const pollRes = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "getTransaction",
        params: { hash: txHash },
      }),
    });
    const pollJson = (await pollRes.json()).result;
    txStatus = pollJson?.status ?? "NOT_FOUND";
    resultXdr = pollJson?.resultXdr ?? "";

    if (txStatus === "FAILED") {
      // Try to decode the failure reason
      let reason = "Unknown reason";
      try {
        const txResult = StellarSdk.xdr.TransactionResult.fromXDR(resultXdr, "base64");
        reason = txResult.result().switch().name;
        const opResults = txResult.result().results();
        if (opResults?.length) {
          reason += ` / ${opResults[0].tr().switch().name}`;
        }
      } catch {
        reason = resultXdr ? `resultXdr: ${resultXdr.slice(0, 60)}...` : "no details";
      }
      throw new Error(`Transaction failed on-chain: ${reason}`);
    }
    
    if (txStatus === "SUCCESS" && pollJson?.resultMetaXdr) {
      try {
        const meta = StellarSdk.xdr.TransactionMeta.fromXDR(pollJson.resultMetaXdr, "base64");
        const sorobanMeta = meta.v3().sorobanMeta();
        if (sorobanMeta) {
          const retVal = sorobanMeta.returnValue();
          if (retVal.switch().name === "scvU32") {
            leafIndex = retVal.u32();
          }
        }
      } catch (e) {
        console.warn("Failed to parse actual leafIndex from meta, falling back to expected index", e);
      }
    }
  }

  const noteString = serializeNote(nullifier, secret, amount, leafIndex);
  const commitmentHex = commitment.toString(16).padStart(64, "0");

  // Persist commitment to server-side store (survives RPC event pruning)
  try {
    await fetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitment: commitmentHex, poolId: ACTIVE_POOL }),
    });
  } catch {
    // Non-fatal — commitment can still be recovered from on-chain events
    console.warn("Failed to persist commitment to local store");
  }

  return {
    noteString,
    txHash,
    leafIndex,
    commitment: commitmentHex,
  };
}
