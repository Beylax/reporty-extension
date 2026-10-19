import type { ReportSelection } from '@reporty/shared';

export function pageSelectionState(selected: ReportSelection[], page: ReportSelection[]) {
  const ids = new Set(selected.map(report => report.id));
  const count = page.filter(report => ids.has(report.id)).length;
  return { all: page.length > 0 && count === page.length, partial: count > 0 && count < page.length };
}

export function selectReportPage(selected: ReportSelection[], page: ReportSelection[], checked: boolean): ReportSelection[] {
  const pageIds = new Set(page.map(report => report.id));
  const otherPages = selected.filter(report => !pageIds.has(report.id));
  return checked ? [...otherPages, ...page] : otherPages;
}
