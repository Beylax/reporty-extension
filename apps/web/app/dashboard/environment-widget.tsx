'use client';
import { Copy, Power } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { Textarea } from '@/components/ui/textarea';
import { useTransition } from 'react';
import { useToastManager } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { WidgetInstallationCheck } from './widget-installation-check';
import { toggleWidget } from './widget-actions';
export function EnvironmentWidget({environmentId,enabled,publicKey,origin,environmentOrigin}:{environmentId:string;enabled:boolean;publicKey:string;origin:string;environmentOrigin:string}) {
  const [pending,startTransition]=useTransition();const toast=useToastManager();
  const snippet=`<script src="${origin}/widget/reporty.js" data-reporty="${publicKey}" defer></script>`;
  return <section className="space-y-3" aria-label="Script di revisione"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Revisione tramite script</h3><InfoTooltip label="Come funziona lo script di revisione">Incolla lo script nel sito e abilitalo per mostrare il pannello Reporty senza installare l’estensione. I visitatori possono consultare le segnalazioni dell’ambiente; per intervenire devono indicare il proprio nome.</InfoTooltip></div><p className="text-xs text-muted-foreground">{enabled?'Attiva: chi visita il sito può gestire tutte le segnalazioni di questo ambiente.':'Disattivata: il pannello è nascosto e le operazioni sono bloccate.'}</p></div><WidgetInstallationCheck environmentOrigin={environmentOrigin} publicKey={publicKey} enabled={enabled} disabled={pending} /></div><div className="grid gap-2"><Label htmlFor={`widget-${environmentId}`}>Script da incollare nel sito</Label><Textarea id={`widget-${environmentId}`} readOnly value={snippet} className="min-h-20 rounded-lg border bg-muted/30 p-3 font-mono text-xs" /><div className="flex flex-wrap gap-2"><Button variant={enabled?'outline':'default'} disabled={pending} onClick={()=>startTransition(async()=>{try{const result=await toggleWidget(environmentId,!enabled);toast.add({title:result.error?'Aggiornamento non riuscito':enabled?'Script disabilitato':'Script abilitato',description:result.error,type:result.error?'error':'success'});}catch{toast.add({title:'Aggiornamento non riuscito',type:'error'});}})}><Power className="size-4" aria-hidden="true" />{pending?<Skeleton className="h-4 w-24 bg-current opacity-30" />:enabled?'Disabilita':'Abilita'}</Button><Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(snippet);toast.add({title:'Script copiato',type:'success'});}catch{toast.add({title:'Seleziona e copia lo script dal campo.',type:'error'});}}}><Copy className="size-4" aria-hidden="true" />Copia script</Button></div></div></section>;
}
