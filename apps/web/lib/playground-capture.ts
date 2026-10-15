let captureInProgress = false;

/** Called synchronously from the dashboard button, preserving browser user activation. */
export async function capturePlaygroundFrame(frame: HTMLIFrameElement, valid: () => boolean) {
  const media = navigator.mediaDevices as MediaDevices & { setCaptureHandleConfig?: (config: object) => void };
  if (!media?.getDisplayMedia || !media.setCaptureHandleConfig) throw new Error('Per acquisire lo screenshot usa Chrome o Edge desktop in HTTPS.');
  if (captureInProgress) throw new Error('Una cattura è già in corso. Completa o annulla la condivisione aperta.');
  const handle = crypto.randomUUID();
  media.setCaptureHandleConfig({ handle, exposeOrigin: true, permittedOrigins: [location.origin] });
  captureInProgress = true;
  let stream: MediaStream | undefined;
  const video = document.createElement('video');
  try {
    stream = await media.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true } as DisplayMediaStreamOptions);
    const track = stream.getVideoTracks()[0] as MediaStreamTrack & { getCaptureHandle?: () => { handle?: string } };
    if (track?.getSettings().displaySurface !== 'browser' || track.getCaptureHandle?.()?.handle !== handle) throw new Error('Seleziona la scheda corrente del playground.');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (!valid() || !frame.isConnected) throw new Error('La pagina è cambiata. Ripeti la cattura.');
    const rect = frame.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) throw new Error('La pagina deve essere interamente visibile per acquisire lo screenshot.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / frame.clientWidth);
    canvas.width = Math.round(frame.clientWidth * scale);
    canvas.height = Math.round(frame.clientHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Acquisizione immagine non disponibile.');
    const x = video.videoWidth / innerWidth, y = video.videoHeight / innerHeight;
    context.drawImage(video, rect.left * x, rect.top * y, rect.width * x, rect.height * y, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    captureInProgress = false;
    media.setCaptureHandleConfig({ handle: '', permittedOrigins: [] });
  }
}
