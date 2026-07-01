import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

/* ── Postgres pool (lazy) ───────────────────────────────── */

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

async function ensureTable() {
  const db = getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS vaults (
      identifier_hash TEXT PRIMARY KEY,
      encrypted_vault TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

let tableReady = false;

/* ── Validation ─────────────────────────────────────────── */

const HEX64 = /^[a-f0-9]{64}$/;
const MAX_VAULT_SIZE = 5 * 1024 * 1024; // 5 MB

/* ── Route ──────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Vault not configured" },
      { status: 503 }
    );
  }

  let body: { action?: string; identifierHash?: string; encryptedVault?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, identifierHash } = body;

  if (!identifierHash || !HEX64.test(identifierHash)) {
    return NextResponse.json(
      { error: "identifierHash must be 64-char hex" },
      { status: 400 }
    );
  }

  if (!tableReady) {
    await ensureTable();
    tableReady = true;
  }

  const db = getPool();

  if (action === "save") {
    const { encryptedVault } = body;
    if (!encryptedVault || encryptedVault.length > MAX_VAULT_SIZE) {
      return NextResponse.json(
        { error: "encryptedVault missing or too large" },
        { status: 400 }
      );
    }

    await db.query(
      `INSERT INTO vaults (identifier_hash, encrypted_vault, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (identifier_hash)
       DO UPDATE SET encrypted_vault = $2, updated_at = NOW()`,
      [identifierHash, encryptedVault]
    );

    return NextResponse.json({ ok: true });
  }

  if (action === "load") {
    const result = await db.query(
      `SELECT encrypted_vault, updated_at FROM vaults WHERE identifier_hash = $1`,
      [identifierHash]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ found: false });
    }

    const row = result.rows[0];
    return NextResponse.json({
      found: true,
      encryptedVault: row.encrypted_vault,
      updatedAt: row.updated_at,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
