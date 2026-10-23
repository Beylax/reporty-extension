import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Circle, Maximize, Pencil, RectangleHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TooltipButton } from '@reporty/shared/ui/tooltip-button';
import { ScreenshotSkeleton } from '@/components/loading-skeletons';
import { useNotify } from '@/components/ui/toast';
import { cropScreenshot, screenshotSelection, type ScreenshotImage, type ScreenshotShape, type SelectionPoint } from '@/lib/screenshot-selection';

const shapes = [
  { value: 'rectangle', label: 'Rettangolo', Icon: RectangleHorizontal },
  { value: 'screen', label: 'Tutto schermo', Icon: Maximize },
  { value: 'circle', label: 'Cerchio', Icon: Circle },
  { value: 'freehand', label: 'Disegno libero', Icon: Pencil },
] as const;

export function ScreenshotSelector({ snapshot, onConfirm, onCancel }: { snapshot: ScreenshotImage; onConfirm: (image: ScreenshotImage) => void; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const drawing = useRef(false);
  const path = useRef<SelectionPoint[]>([]);
  const [points, setPoints] = useState<SelectionPoint[]>([]);
  const [shape, setShape] = useState<ScreenshotShape>('rectangle');
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<ScreenshotImage | null>(null);
  const notify = useNotify();
  const selection = screenshotSelection(shape, points, snapshot.width, snapshot.height);
  useEffect(() => {
    const element = dialog.current;
    const root = element?.getRootNode();
    const previous = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    element?.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => (preview ? confirmButton.current : area.current)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [preview]);
  useEffect(() => {
    const cancel = () => { notify('Viewport cambiata. Acquisisci nuovamente lo screenshot.'); onCancel(); };
    window.addEventListener('resize', cancel);
    return () => window.removeEventListener('resize', cancel);
  }, [notify, onCancel]);
  function update(next: SelectionPoint[]) { path.current = next; setPoints(next); }
  function takePreview(next = selection) {
    if (!next || !image.current || !loaded) return;
    try { setPreview(cropScreenshot(image.current, next, snapshot)); }
    catch (error) { notify(error instanceof Error ? error.message : 'Screenshot non disponibile.'); }
  }
  function point(event: PointerEvent): SelectionPoint {
    return { x: Math.max(0, Math.min(snapshot.width, event.clientX)), y: Math.max(0, Math.min(snapshot.height, event.clientY)) };
  }
  function move(event: PointerEvent) {
    if (!drawing.current) return;
    const next = point(event), previous = path.current;
    if (shape === 'freehand') {
      const last = previous.at(-1);
      if (previous.length < 2000 && (!last || Math.hypot(next.x - last.x, next.y - last.y) >= 2)) update([...previous, next]);
    } else update([previous[0]!, next]);
  }
  return <dialog ref={dialog} aria-label={preview ? 'Anteprima nuovo screenshot' : 'Seleziona area screenshot'} onCancel={event => { event.preventDefault(); event.stopPropagation(); onCancel(); }} onClose={event => event.stopPropagation()} className="pointer-events-auto fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-background p-0 text-foreground backdrop:bg-black/70">
    {preview ? <div className="flex h-full flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Anteprima screenshot</h2><TooltipButton type="button" label="Annulla screenshot" onClick={onCancel}><X aria-hidden="true" /></TooltipButton></header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl border bg-muted/50"><img src={preview.src} alt="Anteprima dell’area selezionata da allegare" className="max-h-full max-w-full object-contain" /></div>
      <footer className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Annulla</Button><Button type="button" variant="outline" onClick={() => { setLoaded(false); setPreview(null); update([]); }}>Riprova</Button><Button ref={confirmButton} type="button" onClick={() => onConfirm(preview)}>Allega screenshot</Button></footer>
    </div> : <>
      {!loaded ? <div className="absolute inset-0"><ScreenshotSkeleton aspectRatio={`${snapshot.width} / ${snapshot.height}`} /></div> : null}
      <img ref={image} src={snapshot.src} alt="Pagina da cui selezionare lo screenshot" className="absolute inset-0 h-full w-full object-fill" onLoad={() => setLoaded(true)} onError={() => { notify('Impossibile aprire lo screenshot. Riprova.'); onCancel(); }} />
      <div ref={area} role="region" aria-label="Area di selezione screenshot" tabIndex={0} className="absolute inset-0 touch-none cursor-crosshair outline-none" onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); takePreview(); }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && shape !== 'freehand' && shape !== 'screen') {
          event.preventDefault();
          const start = path.current[0] ?? { x: snapshot.width / 4, y: snapshot.height / 4 };
          const end = path.current.at(-1) ?? { x: snapshot.width * 3 / 4, y: snapshot.height * 3 / 4 };
          const step = event.shiftKey ? 10 : 1;
          update([start, { x: Math.max(0, Math.min(snapshot.width, end.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0))), y: Math.max(0, Math.min(snapshot.height, end.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0))) }]);
        }
      }} onPointerDown={event => {
        if (!loaded || event.button !== 0 || shape === 'screen') return;
        event.preventDefault();
        event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
        drawing.current = true; update([point(event)]);
      }} onPointerMove={move} onPointerCancel={() => { drawing.current = false; update([]); }} onPointerUp={event => {
        if (!drawing.current) return;
        move(event); drawing.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        const next = screenshotSelection(shape, path.current, snapshot.width, snapshot.height);
        if (next) takePreview(next);
        else { notify('Seleziona un’area più ampia.'); update([]); }
      }}>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${snapshot.width} ${snapshot.height}`}>
          <path d={`M0 0H${snapshot.width}V${snapshot.height}H0Z${selection?.path ?? ''}`} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
          {selection ? <path d={selection.path} fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 4" /> : null}
        </svg>
      </div>
      <header className="absolute inset-x-3 top-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border bg-background p-2 shadow-xl sm:inset-x-auto sm:left-1/2 sm:w-max sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2">
        <div role="group" aria-label="Forma screenshot" className="flex flex-wrap justify-center gap-1">{shapes.map(({ value, label, Icon }) => <Button key={value} type="button" disabled={!loaded} variant={shape === value ? 'default' : 'outline'} aria-pressed={shape === value} onClick={() => { drawing.current = false; setShape(value); update([]); }}><Icon className="size-4" aria-hidden="true" />{label}</Button>)}</div>
        <Button type="button" disabled={!loaded || !selection} onClick={() => takePreview()}>Acquisisci</Button>
        <TooltipButton type="button" label="Annulla selezione screenshot" onClick={onCancel}><X aria-hidden="true" /></TooltipButton>
      </header>
      <p className="pointer-events-none absolute inset-x-4 bottom-4 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-lg bg-background px-3 py-2 text-center text-xs shadow">{shape === 'screen' ? 'Acquisisci tutta l’area visibile della pagina.' : 'Trascina per selezionare l’area. Rettangolo e cerchio: usa anche le frecce e Invio. Esc per annullare.'}</p>
    </>}
  </dialog>;
}
