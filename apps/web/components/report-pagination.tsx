'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
export const REPORT_PAGE_SIZE = 20;
export function useReportPagination(total: number, filterKey: string) {
  const [selection, setSelection] = useState({ key: filterKey, page: 1 });
  const pages = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
  const page = selection.key === filterKey ? Math.min(selection.page, pages) : 1;
  return { page, pages, start: (page - 1) * REPORT_PAGE_SIZE, setPage: (next: number) => setSelection({ key: filterKey, page: Math.max(1, Math.min(next, pages)) }) };
}
export function ReportPageRange({ total, page }: { total: number; page: number }) {
  if (!total) return null;
  return <>{(page - 1) * REPORT_PAGE_SIZE + 1}–{Math.min(page * REPORT_PAGE_SIZE, total)} di {total} segnalazioni</>;
}
export function ReportPagination({ total, page, pages, onChange }: { total: number; page: number; pages: number; onChange: (page: number) => void }) {
  if (!total) return null;
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, index) => start + index);
  return <nav aria-label="Paginazione segnalazioni" className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-3">
    <p className="text-xs text-muted-foreground" aria-live="polite"><ReportPageRange total={total} page={page} /></p>
    {pages > 1 ? <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Pagina precedente"><ChevronLeft className="size-4" /></Button>
      {start > 1 ? <><Button variant="outline" size="icon" onClick={() => onChange(1)} aria-label="Pagina 1">1</Button>{start > 2 ? <span aria-hidden="true" className="px-1 text-muted-foreground">…</span> : null}</> : null}
      {numbers.map(number => <Button key={number} variant={number === page ? 'default' : 'outline'} size="icon" aria-current={number === page ? 'page' : undefined} aria-label={`Pagina ${number}`} onClick={() => onChange(number)}>{number}</Button>)}
      {numbers.at(-1)! < pages ? <>{numbers.at(-1)! < pages - 1 ? <span aria-hidden="true" className="px-1 text-muted-foreground">…</span> : null}<Button variant="outline" size="icon" onClick={() => onChange(pages)} aria-label={`Pagina ${pages}`}>{pages}</Button></> : null}
      <Button variant="outline" size="icon" disabled={page === pages} onClick={() => onChange(page + 1)} aria-label="Pagina successiva"><ChevronRight className="size-4" /></Button>
    </div> : null}
  </nav>;
}
