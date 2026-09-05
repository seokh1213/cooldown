export type ProductMetricName =
  | "simulation_restored"
  | "attacker_selected"
  | "target_selected"
  | "simulation_ready"
  | "simulation_shared"
  | "condition_toggled";

interface ProductMetric {
  name: ProductMetricName;
  patch: string;
  locale: string;
  at: string;
}

export function recordProductMetric(
  name: ProductMetricName,
  context: { patch: string; locale: string },
): void {
  const metric: ProductMetric = {
    name,
    patch: context.patch,
    locale: context.locale,
    at: new Date().toISOString(),
  };
  window.dispatchEvent(new CustomEvent("cooldown:product-metric", { detail: metric }));

  const endpoint = import.meta.env.VITE_PRODUCT_METRICS_ENDPOINT;
  if (!endpoint) return;
  void fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(metric),
    credentials: "omit",
    keepalive: true,
  }).catch(() => undefined);
}
