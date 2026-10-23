export const MAX_REPORT_SCREENSHOTS = 5;

/** Keep reports created by older clients readable and clean up every stored image. */
export function reportScreenshotPaths(report: { screenshot_path?: string | null; screenshot_paths?: string[] | null }) {
  return [...new Set([...(report.screenshot_path ? [report.screenshot_path] : []), ...(report.screenshot_paths ?? [])])];
}
