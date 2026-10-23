import { createCaptureSession } from '@reporty/shared/capture-session';

const session = createCaptureSession();
export const stopTabCapture = session.stop;

export async function captureTab() {
  return session.capture(video => {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Acquisizione immagine non disponibile.');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  });
}
