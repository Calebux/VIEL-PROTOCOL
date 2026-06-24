"use client";

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

/* ── Data Model ─────────────────────────────────────────────── */

export interface StoredNote {
  id: string;
  noteString: string;      // veil-<nullifier>-<secret>-<denom>-<leafIndex>
  token: string;           // "XLM" | "USDC"
  amountDisplay: string;   // "100 XLM"
  amountRaw: string;       // "1000000000"
  createdAt: number;
  txHash: string;
  status: "unspent" | "spent" | "pending";
  spentTxHash?: string;
  spentAt?: number;
}

interface WalletData {
  pinHash: string;
  notes: StoredNote[];
  createdAt: number;
}

const STORAGE_KEY = "veil_wallet_v1";

/* ── Helpers ────────────────────────────────────────────────── */

function hash(input: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(input)));
}

function encode(data: WalletData): string {
  return btoa(JSON.stringify(data));
}

function decode(raw: string): WalletData {
  return JSON.parse(atob(raw));
}

function loadRaw(): WalletData | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return decode(raw);
  } catch {
    return null;
  }
}

function save(data: WalletData) {
  localStorage.setItem(STORAGE_KEY, encode(data));
}

let unlocked = false;

/* ── Public API ─────────────────────────────────────────────── */

export function isWalletInitialized(): boolean {
  return loadRaw() !== null;
}

export function initWallet(pin: string): boolean {
  if (isWalletInitialized()) return false;
  const data: WalletData = {
    pinHash: hash(pin),
    notes: [],
    createdAt: Date.now(),
  };
  save(data);
  unlocked = true;
  return true;
}

export function unlockWallet(pin: string): boolean {
  const data = loadRaw();
  if (!data) return false;
  if (data.pinHash !== hash(pin)) return false;
  unlocked = true;
  return true;
}

export function isUnlocked(): boolean {
  return unlocked;
}

export function lockWallet() {
  unlocked = false;
}

export function addNote(note: Omit<StoredNote, "id" | "createdAt" | "status">): StoredNote {
  const data = loadRaw();
  if (!data) throw new Error("Wallet not initialized");
  const stored: StoredNote = {
    ...note,
    id: hash(note.noteString).slice(0, 16),
    createdAt: Date.now(),
    status: "unspent",
  };
  data.notes.push(stored);
  save(data);
  return stored;
}

export function markSpent(noteId: string, txHash: string) {
  const data = loadRaw();
  if (!data) return;
  const note = data.notes.find((n) => n.id === noteId);
  if (note) {
    note.status = "spent";
    note.spentTxHash = txHash;
    note.spentAt = Date.now();
    save(data);
  }
}

export function getUnspentNotes(token?: string): StoredNote[] {
  const data = loadRaw();
  if (!data) return [];
  return data.notes.filter(
    (n) => n.status === "unspent" && (!token || n.token === token)
  );
}

export function getBalance(token?: string): { total: bigint; display: string } {
  const notes = getUnspentNotes(token);
  const total = notes.reduce((sum, n) => sum + BigInt(n.amountRaw), 0n);
  // Build display from token groups
  if (token) {
    return { total, display: formatAmount(total, token) };
  }
  const byToken: Record<string, bigint> = {};
  for (const n of notes) {
    byToken[n.token] = (byToken[n.token] ?? 0n) + BigInt(n.amountRaw);
  }
  const parts = Object.entries(byToken).map(([t, amt]) => formatAmount(amt, t));
  return { total, display: parts.join(" + ") || "0" };
}

function formatAmount(raw: bigint, token: string): string {
  const scale = 10n ** 7n; // Stellar 7 decimals
  const whole = raw / scale;
  const frac = raw % scale;
  if (frac === 0n) return `${whole} ${token}`;
  const fracStr = frac.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}.${fracStr} ${token}`;
}

export function getAllActivity(): StoredNote[] {
  const data = loadRaw();
  if (!data) return [];
  return [...data.notes].sort((a, b) => b.createdAt - a.createdAt);
}

export function selectNoteForAmount(
  token: string,
  amountRaw: string
): StoredNote | null {
  const notes = getUnspentNotes(token);
  const target = BigInt(amountRaw);
  // Exact match first
  const exact = notes.find((n) => BigInt(n.amountRaw) === target);
  if (exact) return exact;
  // Smallest sufficient note
  const sufficient = notes
    .filter((n) => BigInt(n.amountRaw) >= target)
    .sort((a, b) => {
      const diff = BigInt(a.amountRaw) - BigInt(b.amountRaw);
      return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    });
  return sufficient[0] ?? null;
}

export function exportWallet(): string {
  const data = loadRaw();
  if (!data) throw new Error("No wallet to export");
  return JSON.stringify(data.notes, null, 2);
}

export function importWallet(json: string, pin: string): number {
  const notes: StoredNote[] = JSON.parse(json);
  if (!Array.isArray(notes)) throw new Error("Invalid wallet export");
  let data = loadRaw();
  if (!data) {
    initWallet(pin);
    data = loadRaw()!;
  }
  let added = 0;
  for (const note of notes) {
    const exists = data.notes.some((n) => n.noteString === note.noteString);
    if (!exists) {
      data.notes.push(note);
      added++;
    }
  }
  save(data);
  return added;
}

export function resetWallet() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  unlocked = false;
}

/**
 * Generate a deterministic viewing key for a note.
 * The key can decrypt transaction details after a timelock expires,
 * but cannot spend the note's funds.
 *
 * In production this would use NaCl box + timelock encryption.
 * For the demo, we derive a deterministic key from the note + a viewer salt.
 */
export function generateViewingKey(noteId: string, timelockHours: number = 24): {
  viewingKey: string;
  timelockHours: number;
  expiresAt: number;
} {
  const data = loadRaw();
  if (!data) throw new Error("Wallet not initialized");
  const note = data.notes.find((n) => n.id === noteId);
  if (!note) throw new Error("Note not found");

  // Derive a deterministic viewing key from the note string + salt
  const salt = "veil-viewing-key-v1";
  const input = new TextEncoder().encode(salt + note.noteString + timelockHours);
  const hash = sha256(input);
  const vk = "vk-" + bytesToHex(hash).slice(0, 48);

  return {
    viewingKey: vk,
    timelockHours,
    expiresAt: Date.now() + timelockHours * 60 * 60 * 1000,
  };
}
