type CaptureTrack = MediaStreamTrack & { getCaptureHandle?: () => { handle?: string } };
type CaptureMedia = MediaDevices & { setCaptureHandleConfig?: (config: object) => void };

/** Keeps the user-approved current tab shared until the review session ends. */
export function createCaptureSession() {
  let stream: MediaStream | undefined;
  let video: HTMLVideoElement | undefined;
  let media: CaptureMedia | undefined;
  let handle = '';
  let busy = false;
  let generation = 0;
  const listeners = new Set<() => void>();

  function stop() {
    generation++;
    stream?.getTracks().forEach(track => { track.removeEventListener('ended', stop); track.stop(); });
    stream = undefined;
    if (video) video.srcObject = null;
    video = undefined;
    media?.setCaptureHandleConfig?.({ handle: '', permittedOrigins: [] });
    media = undefined;
    handle = '';
    window.removeEventListener('pagehide', stop);
    listeners.forEach(listener => listener());
  }

  function active() {
    return Boolean(stream?.getVideoTracks().some(track => track.readyState === 'live'));
  }

  function validate() {
    const track = stream?.getVideoTracks()[0] as CaptureTrack | undefined;
    if (track?.readyState !== 'live' || track.getSettings().displaySurface !== 'browser'
      || (media?.setCaptureHandleConfig && track.getCaptureHandle?.()?.handle !== handle)) {
      throw new Error('Seleziona la scheda corrente per acquisire lo screenshot.');
    }
  }

  return {
    active,
    stop,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async capture<T>(draw: (video: HTMLVideoElement) => T): Promise<T> {
      if (busy) throw new Error('Una cattura è già in corso. Completa o annulla la condivisione aperta.');
      busy = true;
      let drawing = false;
      try {
        if (!active()) {
          stop();
          media = navigator.mediaDevices as CaptureMedia;
          if (!media?.getDisplayMedia) throw new Error('Screenshot disponibile su browser desktop in HTTPS.');
          handle = crypto.randomUUID();
          media.setCaptureHandleConfig?.({ handle, exposeOrigin: true, permittedOrigins: [location.origin] });
          const version = generation;
          window.addEventListener('pagehide', stop);
          // Request synchronously in the first user gesture; later captures reuse this stream.
          const shared = await media.getDisplayMedia({ video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, surfaceSwitching: 'exclude' } as DisplayMediaStreamOptions);
          if (generation !== version) {
            shared.getTracks().forEach(track => track.stop());
            throw new Error('Condivisione interrotta. Ripeti la cattura.');
          }
          stream = shared;
          validate();
          stream.getVideoTracks()[0]?.addEventListener('ended', stop, { once: true });
          video = document.createElement('video');
          video.srcObject = stream;
          video.muted = true;
          await video.play();
          listeners.forEach(listener => listener());
        }
        const version = generation;
        // Include the new annotation and exclude Reporty's controls on every capture.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        // Page paints can precede the shared video's update. Skip the buffered
        // frame and wait for the following frame before copying the page.
        if (video?.requestVideoFrameCallback) {
          const source = video;
          await new Promise<void>((resolve, reject) => {
            let frame = 0;
            const timeout = setTimeout(() => {
              source.cancelVideoFrameCallback(frame);
              reject(new Error('La condivisione non ha prodotto un nuovo fotogramma. Riprova.'));
            }, 5000);
            frame = source.requestVideoFrameCallback(() => {
              frame = source.requestVideoFrameCallback(() => {
                clearTimeout(timeout);
                resolve();
              });
            });
          });
        }
        if (generation !== version || !video) throw new Error('Condivisione interrotta. Ripeti la cattura.');
        validate();
        drawing = true;
        return draw(video);
      } catch (error) {
        // An invalid crop or cancelled preview must not revoke an approved source.
        // Permission, source validation and stream setup failures still end sharing.
        if (!drawing) stop();
        throw error;
      } finally {
        busy = false;
      }
    },
  };
}
