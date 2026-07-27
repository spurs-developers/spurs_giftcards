import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, codes, trades } from "@/lib/db";
import { getBalance, format } from "@/lib/credit";
import type { ShellData } from "@/components/Shell";

/**
 * Everything the chrome needs, fetched once per page so the sidebar is never
 * guessing: credit balance, unspent cards, and sales still in flight.
 */
export async function getShellData(userId: string): Promise<ShellData> {
  const [credit, cardCount, openTrades] = await Promise.all([
    getBalance(userId),
    db.select({ c: sql<number>`count(*)::int` }).from(codes)
      .where(and(eq(codes.issuedTo, userId), eq(codes.status, "active"))),
    db.select({ c: sql<number>`count(*)::int` }).from(trades)
      .where(and(eq(trades.userId, userId), sql`${trades.status} not in ('paid','rejected')`)),
  ]);

  return {
    creditDisplay: format(credit),
    cards: Number(cardCount[0]?.c ?? 0),
    openTrades: Number(openTrades[0]?.c ?? 0),
  };
}
