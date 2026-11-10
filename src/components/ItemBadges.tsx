import { SEASONING_BY_ID, skuKey, skuName } from "@/lib/menu";
import type { OrderItem } from "@/lib/types";

/** SKUごとの本数を、味付けの色のバッジで並べる（色だけでなく文字でも味付けを出す） */
export function ItemBadges({ items, size = "md" }: { items: readonly OrderItem[]; size?: "sm" | "md" | "lg" }) {
  const cls = { sm: "px-2 py-0.5 text-base", md: "px-3 py-1 text-xl", lg: "px-3 py-1 text-2xl" }[size];
  return (
    <span className="flex flex-wrap gap-2">
      {items.map((i) => {
        const s = SEASONING_BY_ID[i.seasoning];
        return (
          <span key={skuKey(i.item, i.seasoning)} className={`rounded-full border-2 font-bold ${s.bg} ${s.text} ${s.border} ${cls}`}>
            {skuName(i.item, i.seasoning)}×{i.qty}
          </span>
        );
      })}
    </span>
  );
}

export function itemsText(items: readonly OrderItem[]): string {
  return items.map((i) => `${skuName(i.item, i.seasoning)}×${i.qty}`).join("・");
}
