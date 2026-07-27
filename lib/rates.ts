import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, brands, rates, type Brand, type Rate } from "@/lib/db";

/**
 * What we pay for third-party cards.
 *
 * Rates are data, never code (AGENT.md rule 3) — they move with the market and
 * have to change without a deploy. Rows are versioned rather than edited in
 * place: a trade keeps the `rateId` it was quoted at, so months later you can
 * still explain exactly why someone was paid what they were paid.
 *
 * The credit bonus is the whole commercial point. Taking Spurs credit pays
 * measurably more than taking cash, which is what pulls outside liquidity into
 * the closed loop.
 */

export interface BrandWithRate {
  brand: Brand;
  rate: Rate | null;
}

export async function listBrands(): Promise<BrandWithRate[]> {
  const rows = await db.select().from(brands)
    .where(eq(brands.active, true))
    .orderBy(asc(brands.sortOrder), asc(brands.name));

  const withRates = await Promise.all(
    rows.map(async (brand) => ({ brand, rate: await currentRate(brand.id) })),
  );
  // A brand with no live rate can't be traded, so don't advertise it.
  return withRates.filter((r) => r.rate);
}

export async function getBrand(slug: string): Promise<Brand | null> {
  const [brand] = await db.select().from(brands).where(eq(brands.slug, slug)).limit(1);
  return brand ?? null;
}

/** The live rate for a brand/variant — newest active row wins. */
export async function currentRate(brandId: string, variant = "default"): Promise<Rate | null> {
  const [rate] = await db.select().from(rates)
    .where(and(
      eq(rates.brandId, brandId),
      eq(rates.variant, variant),
      eq(rates.active, true),
    ))
    .orderBy(desc(rates.createdAt))
    .limit(1);
  return rate ?? null;
}

export interface Quote {
  rate: Rate;
  faceValue: number;
  /** Naira minor units if they take cash. */
  cashMinor: bigint;
  /** Naira minor units of Spurs credit if they take the bonus instead. */
  creditMinor: bigint;
  /** The difference — what the bonus is actually worth to them. */
  bonusMinor: bigint;
  bonusPct: number;
}

/**
 * Price a card. Returns both payout options every time, because the seller must
 * always be shown the choice — never quote one without the other.
 */
export async function quote(
  brandId: string,
  faceValue: number,
  variant = "default",
): Promise<Quote> {
  const rate = await currentRate(brandId, variant);
  if (!rate) throw new Error("We're not buying this card right now");

  if (!Number.isInteger(faceValue) || faceValue <= 0) {
    throw new Error("Enter the card's face value");
  }
  if (faceValue < rate.minFace) throw new Error(`Minimum for this card is ${rate.minFace} ${rate.faceCurrency}`);
  if (faceValue > rate.maxFace) throw new Error(`Maximum for this card is ${rate.maxFace} ${rate.faceCurrency}`);

  const cashMinor = BigInt(rate.buyMinorPerUnit) * BigInt(faceValue);
  const creditMinor = (cashMinor * BigInt(100 + rate.creditBonusPct)) / 100n;

  return {
    rate,
    faceValue,
    cashMinor,
    creditMinor,
    bonusMinor: creditMinor - cashMinor,
    bonusPct: rate.creditBonusPct,
  };
}

/* ------------------------------------------------------------------ admin */

export async function upsertBrand(input: {
  slug: string; name: string; notes?: string | null;
  autoVerify?: boolean; active?: boolean; requires?: string; sortOrder?: number;
}): Promise<Brand> {
  const [brand] = await db.insert(brands).values({
    slug: input.slug.trim().toLowerCase(),
    name: input.name.trim(),
    notes: input.notes ?? null,
    autoVerify: input.autoVerify ?? false,
    active: input.active ?? true,
    requires: input.requires ?? "both",
    sortOrder: input.sortOrder ?? 0,
  }).onConflictDoUpdate({
    target: brands.slug,
    set: {
      name: input.name.trim(),
      notes: input.notes ?? null,
      autoVerify: input.autoVerify ?? false,
      active: input.active ?? true,
      requires: input.requires ?? "both",
      sortOrder: input.sortOrder ?? 0,
    },
  }).returning();
  return brand;
}

/**
 * Publish a new rate. The old row is retired rather than overwritten so trades
 * quoted against it stay explainable.
 */
export async function setRate(input: {
  brandId: string;
  variant?: string;
  faceCurrency?: string;
  buyMinorPerUnit: string;
  creditBonusPct: number;
  minFace?: number;
  maxFace?: number;
  updatedBy?: string;
}): Promise<Rate> {
  const variant = input.variant ?? "default";

  if (BigInt(input.buyMinorPerUnit) <= 0n) throw new Error("The buy rate must be above zero");
  if (input.creditBonusPct < 0 || input.creditBonusPct > 50) {
    throw new Error("Credit bonus must be between 0% and 50%");
  }

  await db.update(rates).set({ active: false })
    .where(and(eq(rates.brandId, input.brandId), eq(rates.variant, variant), eq(rates.active, true)));

  const [rate] = await db.insert(rates).values({
    brandId: input.brandId,
    variant,
    faceCurrency: input.faceCurrency ?? "USD",
    buyMinorPerUnit: input.buyMinorPerUnit,
    creditBonusPct: input.creditBonusPct,
    minFace: input.minFace ?? 5,
    maxFace: input.maxFace ?? 500,
    updatedBy: input.updatedBy ?? null,
  }).returning();
  return rate;
}

/** Every brand with its live rate, including inactive ones (admin view). */
export async function allBrandsWithRates(): Promise<BrandWithRate[]> {
  const rows = await db.select().from(brands).orderBy(asc(brands.sortOrder), asc(brands.name));
  return Promise.all(rows.map(async (brand) => ({ brand, rate: await currentRate(brand.id) })));
}

/** Rate history for one brand — the audit trail behind old payouts. */
export async function rateHistory(brandId: string, limit = 50): Promise<Rate[]> {
  return db.select().from(rates)
    .where(eq(rates.brandId, brandId))
    .orderBy(desc(rates.createdAt))
    .limit(limit);
}
