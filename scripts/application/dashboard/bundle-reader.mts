export type DashboardBundleReadOptions = Record<string, unknown>;

export type DashboardBundleReader<Bundle = unknown> = {
  readDashboardBundle(targetInput: string, options?: DashboardBundleReadOptions): Bundle;
};

export function readDashboardBundle<Bundle>(
  reader: DashboardBundleReader<Bundle>,
  targetInput: string,
  options: DashboardBundleReadOptions = {},
): Bundle {
  return reader.readDashboardBundle(targetInput, options);
}
