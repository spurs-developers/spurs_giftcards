import { ArrowLeftRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getShellData } from "@/lib/shell";
import { listBrands } from "@/lib/rates";
import Shell from "@/components/Shell";
import SellForm, { type BrandOption } from "./SellForm";

export const dynamic = "force-dynamic";

export default async function Sell() {
  const user = await requireUser();
  const [shell, brands] = await Promise.all([getShellData(user.sub), listBrands()]);

  const options: BrandOption[] = brands.map(({ brand, rate }) => ({
    slug: brand.slug,
    name: brand.name,
    notes: brand.notes,
    requires: brand.requires,
    faceCurrency: rate!.faceCurrency,
    minFace: rate!.minFace,
    maxFace: rate!.maxFace,
    bonusPct: rate!.creditBonusPct,
  }));

  return (
    <Shell data={shell} current="sell" title="Sell a card" user={{ name: user.name, email: user.email }}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Sell a gift card</h1>
        <p className="text-muted mt-1 text-sm">
          Turn an unused card into naira — or take Spurs credit and get more for it.
        </p>
      </div>

      {options.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand mx-auto grid size-14 place-items-center rounded-2xl">
            <ArrowLeftRight className="size-6" />
          </span>
          <p className="mt-4 font-semibold">We're not buying cards right now</p>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">
            Rates are set from the admin console. Once a brand has a live rate it'll appear here.
          </p>
        </div>
      ) : (
        <SellForm brands={options} />
      )}
    </Shell>
  );
}
