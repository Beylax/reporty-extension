import type { Report } from '../src/reports';

export function ReportContextDetails({ context }: { context: Report['context'] }) {
  if (context.anchor.kind === 'page') return <p>Segnalazione collegata alla pagina, senza un punto selezionato.</p>;
  return context.viewport && context.scroll ? <p>Viewport originale: {context.viewport.width} × {context.viewport.height} · scroll {Math.round(context.scroll.y)} px</p> : null;
}
