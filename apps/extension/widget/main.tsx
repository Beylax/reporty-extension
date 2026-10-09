import { Input } from '@/components/ui/input';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewOverlay } from '@/components/review-overlay';
import { ToastProvider, useNotify } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { shadowStyles } from '@/lib/shadow-styles';
import type { Environment } from '@/lib/session';
import css from '@/entrypoints/popup/style.css?inline';

const script=document.currentScript as HTMLScriptElement | null;
const key=script?.dataset.reporty;
const api=script ? new URL(script.src).origin : '';
const storageKey=`reporty-widget:${key}`;
function storedToken() {
  try { const saved = localStorage.getItem(storageKey); if (saved) return saved; } catch { /* Storage unavailable. */ }
  try { const legacy = sessionStorage.getItem(storageKey) ?? ''; if (legacy) { try { localStorage.setItem(storageKey, legacy); } catch { /* Keep legacy session. */ } } return legacy; } catch { return ''; }
}
function saveToken(value: string) {
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    try { if (value) window[kind].setItem(storageKey, value); else window[kind].removeItem(storageKey); } catch { /* Keep session in memory when storage is blocked. */ }
  }
}
const host=document.createElement('div');
host.id='reporty-widget';

function Widget() {
  const [config,setConfig]=useState<{enabled:boolean;environment:Environment}|null>(null);
  const [token,setToken]=useState(storedToken);
  const [name,setName]=useState(''),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const notify=useNotify();
  useEffect(()=>{
    let disposed=false;
    async function refresh() {
      try {
        const response=await fetch(`${api}/api/widget?key=${key}`,{credentials:'omit',cache:'no-store'});
        if(!response.ok) { if(!disposed)setConfig(null); return; }
        const result=await response.json();if(!disposed){host.dataset.enabled=String(result.enabled);setConfig(document.getElementById('reporty-overlay') ? null : result);}
      }catch{if(!disposed)setConfig(null);}
    }
    void refresh();const timer=setInterval(()=>void refresh(),10000);
    return()=>{disposed=true;clearInterval(timer);};
  },[]);
  async function transport(message:Record<string,unknown>) {
    const response=await fetch(`${api}/api/widget`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({...message,action:message.type==='REPORTY_SCREENSHOT'?'screenshot':'reports'})});
    const result=await response.json();
    if(!response.ok){
      if(response.status===401 || result.code==='WIDGET_SESSION_INVALID'){setToken('');saveToken('');}
      throw new Error(result.error ?? 'Operazione non riuscita.');
    }
    return result;
  }
  if(!config?.enabled)return null;
  if(token)return <ReviewOverlay host={host} site={{environmentId:config.environment.id,position:'bottom_right'}} environment={config.environment} transport={transport} logoUrl={`${api}/brand/reporty-symbol.png`} />;
  return <><div className="pointer-events-auto fixed bottom-6 right-6 flex items-center rounded-full border bg-background p-1.5 shadow-xl"><Button aria-label={open ? 'Chiudi inserimento nome' : 'Inizia ad aggiungere segnalazioni'} aria-expanded={open} size="icon" className="size-10 rounded-full" onClick={()=>setOpen(value=>!value)}><span className="flex transition-transform duration-200 motion-reduce:transition-none" style={{transform:open?'rotate(45deg)':'rotate(0deg)'}}><Plus className="size-5" aria-hidden="true" /></span></Button></div>{open?<section className="pointer-events-auto fixed bottom-22 right-6 w-[min(380px,calc(100vw-48px))] space-y-4 rounded-xl border bg-card p-4 shadow-xl"><div className="flex justify-between"><h2 className="font-semibold">Inizia ad aggiungere segnalazioni</h2></div><p className="text-sm text-muted-foreground">{config.environment.projectName} · {config.environment.name}</p><form className="grid gap-3" onSubmit={event=>{event.preventDefault();if(busy)return;setBusy(true);void(async()=>{try{
    const response=await fetch(`${api}/api/widget`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',key,name})});const result=await response.json();if(!response.ok)throw new Error(result.error);saveToken(result.token);setToken(result.token);notify('Ora puoi aggiungere segnalazioni.','success');
  }catch(error){notify(error instanceof Error?error.message:'Avvio non riuscito.');}finally{setBusy(false);}})();}}><Label htmlFor="reporty-widget-name">Il tuo nome</Label><Input id="reporty-widget-name" className="h-9 rounded-lg border bg-background px-3" required maxLength={80} value={name} onChange={event=>setName(event.target.value)} /><Button type="submit" disabled={busy}>{busy?<Skeleton className="h-4 w-32 bg-current opacity-30" />:'Inizia ad aggiungere segnalazioni'}</Button></form></section>:null}</>;
}
if(key && !document.getElementById('reporty-overlay') && !document.getElementById('reporty-widget')) {
  host.style.cssText='all:initial!important;display:block!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;font:14px/1.5 system-ui,sans-serif!important';
  document.documentElement.append(host);
  const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style'),mount=document.createElement('div');
  style.textContent=shadowStyles(css);shadow.append(style,mount);
  createRoot(mount).render(<ToastProvider><Widget /></ToastProvider>);
}
