export { VeilClient, type VeilClientConfig, type DepositResult, type WithdrawResult } from "./veil";
export { createNote, serializeNote, deserializeNote, encryptNote, decryptNote, recomputeNote, type VeilNote } from "./note";
export { MerkleTree } from "./merkle";
export { generateWithdrawProof, verifyProofLocally, addressToField, type WithdrawProofResult } from "./proof";
export { RelayerClient, type RelayRequest, type RelayResponse } from "./relayer";
export {
  deriveViewingKey,
  encryptNoteForViewing,
  decryptWithViewingKey,
  getTimelockRemaining,
  type ViewingKeyPair,
  type TimelockEnvelope,
} from "./viewing-keys";
