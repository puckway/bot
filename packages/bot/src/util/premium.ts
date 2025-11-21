import type { InteractionContext } from "../interactions";

// If there are no SKUs defined, it is assumed that the owner of this
// instance does not want to utilize premium-only features
export const isPremium = (ctx: InteractionContext) => {
  if (!ctx.env.MONTHLY_SKU && !ctx.env.LIFETIME_SKU) {
    return true;
  }

  const skuIds = ctx.interaction.entitlements.map(
    (entitlement) => entitlement.sku_id,
  );
  if (ctx.env.MONTHLY_SKU && skuIds.includes(ctx.env.MONTHLY_SKU)) {
    return true;
  }
  if (ctx.env.LIFETIME_SKU && skuIds.includes(ctx.env.LIFETIME_SKU)) {
    return true;
  }
};
