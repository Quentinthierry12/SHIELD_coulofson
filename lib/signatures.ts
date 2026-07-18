import { createHash } from "crypto";
import { db } from "./db";

// A signature is only meaningful if it binds to an exact state of the document.
// OnlyOffice overwrites content on every save and keeps no history, so we fingerprint
// the bytes at request time and re-check them at signing time.
export const hashContent = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

export async function docHash(docId: number): Promise<{ hash: string; version: number } | null> {
  const p = await db();
  const { rows } = await p.query("SELECT content, version FROM documents WHERE id = $1", [docId]);
  if (!rows[0]) return null;
  return { hash: hashContent(rows[0].content), version: rows[0].version };
}

// Whose turn is it? In a sequential circuit only the lowest unsigned position may sign;
// in a parallel one every pending signer may sign at any time.
export function isMyTurn(
  signers: { user_id: number; position: number; status: string }[],
  userId: number,
  sequential: boolean
): boolean {
  const me = signers.find((s) => s.user_id === userId);
  if (!me || me.status !== "pending") return false;
  if (!sequential) return true;
  const firstPending = signers
    .filter((s) => s.status === "pending")
    .sort((a, b) => a.position - b.position)[0];
  return firstPending?.user_id === userId;
}
