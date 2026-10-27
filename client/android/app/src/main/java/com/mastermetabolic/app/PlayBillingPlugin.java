package com.mastermetabolic.app;

import android.app.Activity;
import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;

/**
 * Sells the two digital subscriptions. Acknowledgement stays on the server,
 * which calls the Play Developer API after it verifies the purchase token.
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    static final String SELF_GUIDED = "com.mastermetabolic.app.plan.self_guided.monthly";
    static final String PLUS = "com.mastermetabolic.app.plan.plus.monthly";

    private final Object billingLock = new Object();
    private BillingClient billingClient;
    private PluginCall pendingPurchase;
    private String pendingProductId;

    private interface BillingReady {
        void run(BillingClient client);
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        List<String> productIds = productIdsFrom(call);
        if (productIds.isEmpty()) {
            call.reject("productIds is required");
            return;
        }
        withBilling(call, client -> queryProducts(call, client, productIds, null));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String obfuscatedAccountId = call.getString("obfuscatedAccountId");
        if (productId == null || (!SELF_GUIDED.equals(productId) && !PLUS.equals(productId))) {
            call.reject("That plan is not sold as a Google Play subscription.");
            return;
        }
        if (obfuscatedAccountId == null || obfuscatedAccountId.isEmpty() || obfuscatedAccountId.length() > 64) {
            call.reject("A Play Billing account id is required.");
            return;
        }
        synchronized (billingLock) {
            if (pendingPurchase != null) {
                call.reject("A purchase is already in progress.");
                return;
            }
            pendingPurchase = call;
            pendingProductId = productId;
        }
        withBilling(call, client -> queryProducts(call, client, List.of(productId), details -> launchPurchase(call, client, details, obfuscatedAccountId)));
    }

    @PluginMethod
    public void queryPurchases(PluginCall call) {
        withBilling(call, client -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    rejectCall(call, message(billingResult, "Could not read Google Play purchases"));
                    return;
                }
                JSObject result = new JSObject();
                result.put("purchases", purchaseArray(purchases));
                call.resolve(result);
            }
        ));
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        PluginCall call;
        String productId;
        synchronized (billingLock) {
            call = pendingPurchase;
            productId = pendingProductId;
            pendingPurchase = null;
            pendingProductId = null;
        }
        if (call == null) return;

        int code = billingResult.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject canceled = new JSObject();
            canceled.put("canceled", true);
            call.resolve(canceled);
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject(message(billingResult, "Google Play purchase failed"));
            return;
        }

        Purchase match = null;
        for (Purchase purchase : purchases) {
            List<String> products = purchase.getProducts();
            if (productId != null && products != null && products.contains(productId)) {
                match = purchase;
                break;
            }
        }
        if (match == null) {
            call.reject("Google Play did not return that subscription.");
            return;
        }
        call.resolve(purchasePayload(match));
    }

    private void launchPurchase(PluginCall call, BillingClient client, ProductDetails details, String obfuscatedAccountId) {
        ProductDetails.SubscriptionOfferDetails offer = chooseOffer(details);
        if (offer == null) {
            rejectCall(call, "Google Play did not return a subscription offer.");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            rejectCall(call, "Play Billing is unavailable");
            return;
        }

        BillingFlowParams params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(List.of(
                BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(details)
                    .setOfferToken(offer.getOfferToken())
                    .build()
            ))
            .setObfuscatedAccountId(obfuscatedAccountId)
            .build();

        activity.runOnUiThread(() -> {
            // pendingPurchase is already this call, so a listener that runs inside launchBillingFlow is not dropped.
            BillingResult launched = client.launchBillingFlow(activity, params);
            int code = launched.getResponseCode();
            if (code == BillingClient.BillingResponseCode.OK) return;
            if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                resolveOwned(call, client, details.getProductId());
                return;
            }
            synchronized (billingLock) {
                if (pendingPurchase != call) return;
                pendingPurchase = null;
                pendingProductId = null;
            }
            if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
                JSObject canceled = new JSObject();
                canceled.put("canceled", true);
                call.resolve(canceled);
                return;
            }
            call.reject(message(launched, "Could not open Google Play"));
        });
    }

    private void resolveOwned(PluginCall call, BillingClient client, String productId) {
        client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (billingResult, purchases) -> {
                if (purchases != null) {
                    for (Purchase purchase : purchases) {
                        List<String> products = purchase.getProducts();
                        if (products != null && products.contains(productId)) {
                            releasePurchase(call);
                            call.resolve(purchasePayload(purchase));
                            return;
                        }
                    }
                }
                rejectCall(call, message(billingResult, "Google Play says this subscription is already owned"));
            }
        );
    }

    private interface ProductReady {
        void run(ProductDetails details);
    }

    private void queryProducts(PluginCall call, BillingClient client, List<String> productIds, ProductReady onOne) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String productId : productIds) {
            if (!SELF_GUIDED.equals(productId) && !PLUS.equals(productId)) continue;
            products.add(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            );
        }
        if (products.isEmpty()) {
            rejectCall(call, "productIds is required");
            return;
        }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(products).build();
        client.queryProductDetailsAsync(params, (billingResult, queryProductDetailsResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                rejectCall(call, message(billingResult, "Could not load Google Play products"));
                return;
            }
            List<ProductDetails> details = productDetails(queryProductDetailsResult);
            if (onOne != null) {
                if (details.isEmpty()) {
                    rejectCall(call, "Google Play did not return that subscription.");
                    return;
                }
                onOne.run(details.get(0));
                return;
            }
            JSArray listed = new JSArray();
            for (ProductDetails item : details) {
                JSObject product = productPayload(item);
                if (product != null) add(listed, product);
            }
            JSObject result = new JSObject();
            result.put("products", listed);
            call.resolve(result);
        });
    }

    private List<ProductDetails> productDetails(QueryProductDetailsResult result) {
        if (result == null || result.getProductDetailsList() == null) return List.of();
        return result.getProductDetailsList();
    }

    private JSObject productPayload(ProductDetails details) {
        ProductDetails.SubscriptionOfferDetails offer = chooseOffer(details);
        if (offer == null || offer.getPricingPhases() == null) return null;
        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
        if (phases == null || phases.isEmpty()) return null;
        ProductDetails.PricingPhase phase = phases.get(phases.size() - 1);
        JSObject item = new JSObject();
        item.put("id", details.getProductId());
        item.put("displayName", details.getName());
        item.put("description", details.getDescription());
        item.put("displayPrice", phase.getFormattedPrice());
        item.put("price", phase.getPriceAmountMicros() / 1_000_000d);
        item.put("currencyCode", phase.getPriceCurrencyCode());
        item.put("subscriptionPeriodUnit", periodUnit(phase.getBillingPeriod()));
        item.put("subscriptionPeriodValue", periodValue(phase.getBillingPeriod()));
        return item;
    }

    private ProductDetails.SubscriptionOfferDetails chooseOffer(ProductDetails details) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        ProductDetails.SubscriptionOfferDetails base = null;
        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
            String offerId = offer.getOfferId();
            if (offerId != null && !offerId.isEmpty()) continue;
            if (base == null) base = offer;
            if (offer.getPricingPhases() == null || offer.getPricingPhases().getPricingPhaseList() == null) continue;
            List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
            if (phases.isEmpty()) continue;
            if ("P1M".equals(phases.get(phases.size() - 1).getBillingPeriod())) return offer;
        }
        return base != null ? base : offers.get(0);
    }

    private JSArray purchaseArray(List<Purchase> purchases) {
        JSArray array = new JSArray();
        if (purchases == null) return array;
        for (Purchase purchase : purchases) {
            add(array, purchasePayload(purchase));
        }
        return array;
    }

    private JSObject purchasePayload(Purchase purchase) {
        JSObject item = new JSObject();
        List<String> products = purchase.getProducts();
        item.put("purchaseToken", purchase.getPurchaseToken());
        item.put("productId", products == null || products.isEmpty() ? "" : products.get(0));
        item.put("orderId", purchase.getOrderId());
        item.put("pending", purchase.getPurchaseState() == Purchase.PurchaseState.PENDING);
        item.put("canceled", false);
        AccountIdentifiers identifiers = purchase.getAccountIdentifiers();
        if (identifiers != null) item.put("obfuscatedAccountId", identifiers.getObfuscatedAccountId());
        return item;
    }

    private void withBilling(PluginCall call, BillingReady ready) {
        if (getContext() == null) {
            rejectCall(call, "Play Billing is unavailable");
            return;
        }
        BillingClient client = ensureClient();
        if (client.isReady()) {
            ready.run(client);
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    ready.run(client);
                    return;
                }
                rejectCall(call, message(billingResult, "Play Billing is unavailable"));
            }

            @Override
            public void onBillingServiceDisconnected() {
                // The next call reconnects. Auto service reconnection covers mid-call drops.
            }
        });
    }

    private BillingClient ensureClient() {
        if (billingClient != null) return billingClient;
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection()
            .build();
        return billingClient;
    }

    private List<String> productIdsFrom(PluginCall call) {
        List<String> ids = new ArrayList<>();
        JSArray array;
        try {
            array = call.getArray("productIds");
        } catch (Exception error) {
            return ids;
        }
        if (array == null) return ids;
        for (int index = 0; index < array.length(); index += 1) {
            String id = array.optString(index, "");
            if (SELF_GUIDED.equals(id) || PLUS.equals(id)) ids.add(id);
        }
        return ids;
    }

    private void releasePurchase(PluginCall call) {
        synchronized (billingLock) {
            if (pendingPurchase == call) {
                pendingPurchase = null;
                pendingProductId = null;
            }
        }
    }

    private void rejectCall(PluginCall call, String message) {
        releasePurchase(call);
        call.reject(message);
    }

    private static void add(JSArray array, Object value) {
        array.put(value);
    }

    private static String message(BillingResult result, String fallback) {
        String debug = result.getDebugMessage();
        if (debug == null || debug.isEmpty()) return fallback;
        return debug;
    }

    private static String periodUnit(String iso) {
        if (iso == null) return "";
        if (iso.endsWith("M")) return "month";
        if (iso.endsWith("Y")) return "year";
        if (iso.endsWith("W")) return "week";
        if (iso.endsWith("D")) return "day";
        return "";
    }

    private static int periodValue(String iso) {
        if (iso == null) return 1;
        String digits = iso.replaceAll("[^0-9]", "");
        if (digits.isEmpty()) return 1;
        try {
            return Integer.parseInt(digits);
        } catch (NumberFormatException error) {
            return 1;
        }
    }
}
