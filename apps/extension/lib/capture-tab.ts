export async function captureTab() {
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
