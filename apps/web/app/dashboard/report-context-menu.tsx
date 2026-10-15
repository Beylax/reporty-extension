'use client';

import { useContext, useRef, type ReactElement } from 'react';
import { ContextMenu } from '@base-ui/react/context-menu';
import { ExternalLink, MessageSquare, MonitorPlay, Trash2 } from 'lucide-react';
import type { Report } from '@reporty/shared';
import { PlaygroundContext } from './playground-trigger';

const itemClass = 'flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4';

export function ReportContextMenu({ report, url, disabled, onOpen, onDelete, children }: {
  report: Report; url: string; disabled: boolean; onOpen: () => void; onDelete: () => void; children: ReactElement;
}) {
  const trigger = useRef<HTMLDivElement>(null);
  const openPlayground = useContext(PlaygroundContext);
  const openingDialog = useRef(false);
  return <ContextMenu.Root onOpenChange={open => { if (open) openingDialog.current = false; }}>
    <ContextMenu.Trigger ref={trigger} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-ring" render={children} />
    <ContextMenu.Portal><ContextMenu.Positioner className="z-50" sideOffset={4}>
      <ContextMenu.Popup aria-label="Azioni segnalazione" finalFocus={() => openingDialog.current ? false : trigger.current} className="min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none" onClick={event => event.stopPropagation()}>
        <ContextMenu.Item className={itemClass} disabled={disabled} onClick={() => { openingDialog.current = true; onOpen(); }}><MessageSquare aria-hidden="true" />Apri segnalazione</ContextMenu.Item>
        {url !== '#' && !disabled ? <ContextMenu.LinkItem className={itemClass} href={url} target="_blank" rel="noopener noreferrer" closeOnClick><ExternalLink aria-hidden="true" />Visualizza sul sito web</ContextMenu.LinkItem> : <ContextMenu.Item className={itemClass} disabled><ExternalLink aria-hidden="true" />Visualizza sul sito web</ContextMenu.Item>}
        {openPlayground ? <ContextMenu.Item className={`${itemClass} hidden md:flex`} disabled={disabled || !openPlayground || url === '#'} onClick={() => { if (trigger.current) { openingDialog.current = true; openPlayground?.(report.environment_id, trigger.current, { id: report.id, url: report.context.url }); } }}><MonitorPlay aria-hidden="true" />Apri in playground</ContextMenu.Item> : null}
        {report.canEdit ? <><ContextMenu.Separator className="my-1 h-px bg-border" /><ContextMenu.Item className={`${itemClass} text-destructive`} disabled={disabled} onClick={() => { openingDialog.current = true; onDelete(); }}><Trash2 aria-hidden="true" />Elimina</ContextMenu.Item></> : null}
      </ContextMenu.Popup>
    </ContextMenu.Positioner></ContextMenu.Portal>
  </ContextMenu.Root>;
}
