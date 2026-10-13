import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewOverlay } from '@/components/review-overlay';
import { ToastProvider, useNotify } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { shadowStyles } from '@/lib/shadow-styles';
import { isOpenerPosition } from '@/lib/opener-position';
import type { Site, Environment } from '@/lib/session';
import css from '@/entrypoints/popup/style.css?inline';

const script=document.currentScript as HTMLScriptElement | null;
const key=script?.dataset.reporty;
const api=script ? new URL(script.src).origin : '';
const storageKey=`reporty-widget:${key}`;
const positionStorageKey = `${storageKey}:position`;
function storedPosition(): Site['position'] {
  try {
    const saved = localStorage.getItem(positionStorageKey);
    if (isOpenerPosition(saved)) return saved;
  } catch { /* Storage unavailable: use the default position. */ }
  return 'bottom_right';
}
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
  const [position,setPosition]=useState(storedPosition);
  async function changePosition(value: Site['position']) {
    try { localStorage.setItem(positionStorageKey, value); }
    catch { throw new Error('Impossibile salvare la posizione: lo storage del browser non è disponibile.'); }
    setPosition(value);
  }
  const [sessionStarting,setSessionStarting]=useState(false);
  const [sessionAttempt,setSessionAttempt]=useState(0);
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
  useEffect(() => {
    if (!config?.enabled || token) return;
    let disposed = false;
    const controller = new AbortController();
    setSessionStarting(true);
    void (async () => {
      try {
        const response = await fetch(`${api}/api/widget`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', key }), signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Consultazione non disponibile.');
        if (!disposed) { saveToken(result.token); setToken(result.token); }
      } catch (error) {
        if (!disposed) notify(error instanceof Error ? error.message : 'Consultazione non disponibile.');
      } finally { if (!disposed) setSessionStarting(false); }
    })();
    return () => { disposed = true; controller.abort(); };
  }, [config?.enabled, token, sessionAttempt]);
  async function transport(message:Record<string,unknown>) {
    const response=await fetch(`${api}/api/widget`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({...message,action:message.type==='REPORTY_IDENTITY'?'identity':message.type==='REPORTY_SCREENSHOT'?'screenshot':message.type==='REPORTY_ATTACHMENT'?'attachment':'reports'})});
    const result=await response.json();
    if(!response.ok){
      if(response.status===401 || result.code==='WIDGET_SESSION_INVALID'){setToken('');saveToken('');}
      throw new Error(result.error ?? 'Operazione non riuscita.');
    }
    return result;
  }
  if(!config?.enabled)return null;
  if(token)return <ReviewOverlay host={host} site={{environmentId:config.environment.id,position}} onPositionChange={changePosition} environment={config.environment} transport={transport} logoUrl={`${api}/brand/reporty-symbol.png`} />;
  const top = position.startsWith('top'), left = position.endsWith('left');
  return <div role={sessionStarting ? 'status' : undefined} aria-label={sessionStarting ? 'Caricamento pannello segnalazioni' : undefined} style={{ [top ? 'top' : 'bottom']: 24, [left ? 'left' : 'right']: 24 }} className="pointer-events-auto fixed flex items-center gap-1 rounded-full border bg-background p-1.5 shadow-xl">{sessionStarting ? <><Skeleton className="size-9 rounded-lg" /><Skeleton className="size-10 rounded-full" /></> : <Button size="icon" variant="ghost" aria-label="Riprova ad aprire le segnalazioni" onClick={() => setSessionAttempt(value => value + 1)}><Menu className="size-5" /></Button>}</div>;
}
if(key && !document.getElementById('reporty-overlay') && !document.getElementById('reporty-widget')) {
  host.style.cssText='all:initial!important;display:block!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;font:14px/1.5 system-ui,sans-serif!important';
  document.documentElement.append(host);
  const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style'),mount=document.createElement('div');
  style.textContent=shadowStyles(css);shadow.append(style,mount);
  createRoot(mount).render(<ToastProvider><Widget /></ToastProvider>);
}
