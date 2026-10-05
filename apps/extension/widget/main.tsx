import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReviewOverlay } from '@/components/review-overlay';
import { ToastProvider, useNotify } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { shadowStyles } from '@/lib/shadow-styles';
import type { Environment } from '@/lib/session';
import css from '@/entrypoints/popup/style.css?inline';

const script=document.currentScript as HTMLScriptElement | null;
const key=script?.dataset.reporty;
const api=script ? new URL(script.src).origin : '';
const storageKey=`reporty-widget:${key}`;
const host=document.createElement('div');
host.id='reporty-widget';

async function captureTab() {
  if(!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screenshot disponibile su browser desktop in HTTPS.');
  const handle=crypto.randomUUID();
  const media=navigator.mediaDevices as MediaDevices & {setCaptureHandleConfig?: (config:object)=>void};
  media.setCaptureHandleConfig?.({handle,exposeOrigin:true,permittedOrigins:[location.origin]});
  let stream: MediaStream | undefined;
  const video=document.createElement('video');
  try {
    stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false,preferCurrentTab:true} as DisplayMediaStreamOptions);
    const track=stream.getVideoTracks()[0];
    if(track?.getSettings().displaySurface !== 'browser') throw new Error('Seleziona una scheda del browser per acquisire lo screenshot.');
    const captured=(track as MediaStreamTrack & {getCaptureHandle?:()=>{handle?:string;origin?:string}})?.getCaptureHandle?.();
    if(media.setCaptureHandleConfig && captured?.handle!==handle)throw new Error('Seleziona la scheda corrente del sito da revisionare.');
    video.srcObject=stream;
    video.muted=true;
    await video.play();
    // Wait for a frame after permission UI has disappeared.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,1920/video.videoWidth);
    canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
    canvas.getContext('2d')!.drawImage(video,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',0.75);
  } finally { stream?.getTracks().forEach(track=>track.stop());video.srcObject=null;media.setCaptureHandleConfig?.({handle:'',permittedOrigins:[]}); }
}
function Widget() {
  const [config,setConfig]=useState<{enabled:boolean;environment:Environment}|null>(null);
  const [token,setToken]=useState(()=>{try{return sessionStorage.getItem(storageKey) ?? '';}catch{return '';}});
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
    if(message.type==='REPORTY_CAPTURE')return captureTab();
    const response=await fetch(`${api}/api/widget`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({...message,action:message.type==='REPORTY_SCREENSHOT'?'screenshot':'reports'})});
    const result=await response.json();
    if(!response.ok){
      if(response.status===403 || response.status===401){setToken('');try{sessionStorage.removeItem(storageKey);}catch{/* Storage unavailable. */}}
      throw new Error(result.error ?? 'Operazione non riuscita.');
    }
    return result;
  }
  if(!config?.enabled)return null;
  if(token)return <ReviewOverlay host={host} site={{environmentId:config.environment.id,position:'bottom_right'}} environment={config.environment} transport={transport} logoUrl={`${api}/brand/reporty-symbol.png`} />;
  return <><Button aria-label="Apri Reporty" className="pointer-events-auto fixed bottom-6 right-6 size-13 rounded-full shadow-xl" onClick={()=>setOpen(value=>!value)}>+</Button>{open?<section className="pointer-events-auto fixed bottom-22 right-6 w-[min(380px,calc(100vw-48px))] space-y-4 rounded-xl border bg-card p-4 shadow-xl"><div className="flex justify-between"><h2 className="font-semibold">Inizia la revisione</h2></div><p className="text-sm text-muted-foreground">{config.environment.projectName} · {config.environment.name}</p><form className="grid gap-3" onSubmit={event=>{event.preventDefault();if(busy)return;setBusy(true);void(async()=>{try{
    const response=await fetch(`${api}/api/widget`,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',key,name})});const result=await response.json();if(!response.ok)throw new Error(result.error);try{sessionStorage.setItem(storageKey,result.token);}catch{/* Keep session in memory. */}setToken(result.token);notify('Revisione pronta.','success');
  }catch(error){notify(error instanceof Error?error.message:'Avvio non riuscito.');}finally{setBusy(false);}})();}}><label htmlFor="reporty-widget-name">Il tuo nome</label><input id="reporty-widget-name" className="h-9 rounded-lg border bg-background px-3" required maxLength={80} value={name} onChange={event=>setName(event.target.value)} /><Button type="submit" disabled={busy}>{busy?<Skeleton className="h-4 w-32 bg-current opacity-30" />:'Inizia revisione'}</Button></form></section>:null}</>;
}
if(key && !document.getElementById('reporty-overlay') && !document.getElementById('reporty-widget')) {
  host.style.cssText='all:initial!important;display:block!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;font:14px/1.5 system-ui,sans-serif!important';
  document.documentElement.append(host);
  const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style'),mount=document.createElement('div');
  style.textContent=shadowStyles(css);shadow.append(style,mount);
  createRoot(mount).render(<ToastProvider><Widget /></ToastProvider>);
}
