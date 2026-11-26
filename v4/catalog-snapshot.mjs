// The catalog price must be written only if its observed override is still current.
 // This expression is evaluated inside the INSERT transaction, not during the earlier read.
 // A mismatch writes NULL to orders.catalog_price (NOT NULL), aborting the entire D1 batch.
 // Missing override and a default-valued override are intentionally equivalent.
export const guardedCatalogPrice = `CASE WHEN
 COALESCE((SELECT enabled FROM catalog_overrides WHERE service_id=?),1)=1
 AND (SELECT amount FROM catalog_overrides WHERE service_id=?) IS ?
 AND COALESCE((SELECT promo_percent FROM catalog_overrides WHERE service_id=?),0)=?
 THEN ? ELSE NULL END`;
export function catalogPriceBindings(serviceId, override, price){
 return [serviceId,serviceId,override?.amount??null,serviceId,override?.promo_percent??0,price];
}
export function catalogChangedError(error){
 return /catalog_disabled|NOT NULL constraint failed: orders\.catalog_price/i.test(String(error?.message??error));
}
