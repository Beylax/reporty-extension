import { build } from 'vite';
import tailwind from '@tailwindcss/vite';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../apps/extension/',import.meta.url));
await build({logLevel:'error',configFile:false,root,tsconfig:root+'widget/tsconfig.json',publicDir:false,plugins:[tailwind()],resolve:{alias:{'@':root}},oxc:{jsx:{runtime:'automatic'}},define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{outDir:fileURLToPath(new URL('../apps/web/public/widget/',import.meta.url)),emptyOutDir:true,lib:{entry:root+'widget/main.tsx',name:'ReportyWidget',formats:['iife'],fileName:()=> 'panel.js'}}});

// Lightweight bootstrap: React and panel styles load only while enabled.
await writeFile(new URL('../apps/web/public/widget/reporty.js',import.meta.url),`(()=>{
  const tag=document.currentScript,key=tag?.dataset.reporty,api=tag?new URL(tag.src).origin:'';
  if(!key)return;
  window.addEventListener('message',event=>{
    const input=event.data;
    if(window.parent!==window&&event.source===window.parent&&event.origin===api&&input?.type==='REPORTY_PLAYGROUND_CONNECT'&&input.key===key&&typeof input.nonce==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.nonce)&&typeof input.active==='boolean'){
      const wasActive=parentActivity?.active&&Date.now()<parentActivity.expires;
      parentActivity={active:input.active,expires:Date.now()+3000};
      if(input.active&&!wasActive)void check();
      return;
    }
    if(event.origin!==api||!window.opener||event.source!==window.opener||input?.type!=='REPORTY_VERIFY_WIDGET'||typeof input.nonce!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.nonce))return;
    event.source.postMessage({type:'REPORTY_WIDGET_VERIFIED',nonce:input.nonce,key},api);
  });
  let loaded=false,busy=false,parentActivity;
  const active=()=>document.visibilityState==='visible'&&(parentActivity?parentActivity.active&&Date.now()<parentActivity.expires:document.hasFocus());
  async function check(){
    if(loaded||busy||!active())return;
    busy=true;
    try{
      const response=await fetch(api+'/api/widget?key='+encodeURIComponent(key),{credentials:'omit',cache:'no-store'});
      if(!response.ok)return;
      const config=await response.json();
      if(!config.enabled||!active())return;
      loaded=true;
      const panel=document.createElement('script');
      panel.src=api+'/widget/panel.js';panel.dataset.reporty=key;
      panel.onerror=()=>{loaded=false;};document.head.append(panel);
    }catch{}finally{busy=false;}
  }
  document.addEventListener('visibilitychange',check);
  window.addEventListener('focus',check);
  check();setInterval(check,10000);
})();`);
