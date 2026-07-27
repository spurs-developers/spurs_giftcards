import "server-only";
import { process as runQueue, type Handler } from "@/lib/queue";
import { verifyTrade, settleTrade } from "@/lib/trades";
import { fulfilOrder } from "@/lib/orders";

/**
 * The handler table. Every one of these is idempotent — the queue guarantees
 * at-least-once delivery, so a handler that runs twice must be harmless.
 */
const HANDLERS: Record<string, Handler> = {
  verify_trade: async (p) => verifyTrade(String(p.tradeId)),
  settle_trade: async (p) => settleTrade(String(p.tradeId)),
  fulfil_order: async (p) => fulfilOrder(String(p.orderId)),
};

export const runJobs = (limit = 20) => runQueue(HANDLERS, limit);
