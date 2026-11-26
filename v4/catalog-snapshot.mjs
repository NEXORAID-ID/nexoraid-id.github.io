// The catalog price must be written only if its observed override is still current.
 // This expression is evaluated inside the INSERT transaction, not during the earlier read.
 // A mismatch writes NULL to orders.catalog_price (NOT NULL), aborting the entire D1 batch.
 // Missing override and a default-valued override are intentionally equivalent.
export const guardedCatalogPrice = `CASE WHEN
 COALESCE((SELECT enabled FROM catalog_overrides WHERE service_id=?),1)=1
 AND (SELECT amount FROM catalog_overrides WHERE service_id=?) IS ?
 AND COALESCE((SELECT promo_percent FROM catalog_overrides WHERE service_id=?),0)=?
 AND (SELECT promo_percent FROM service_policies WHERE service_id=?) IS ?
 AND (SELECT promo_start FROM service_policies WHERE service_id=?) IS ?
 AND (SELECT promo_end FROM service_policies WHERE service_id=?) IS ?
 THEN ? ELSE NULL END`;
export function catalogPriceBindings(serviceId, state, price){
 return [serviceId,serviceId,state?.amount??null,serviceId,state?.promo_percent??0,serviceId,state?.scheduled_percent??null,serviceId,state?.promo_start??null,serviceId,state?.promo_end??null,price];
}
export function catalogChangedError(error){
 return /catalog_disabled|NOT NULL constraint failed: orders\.catalog_price/i.test(String(error?.message??error));
}
