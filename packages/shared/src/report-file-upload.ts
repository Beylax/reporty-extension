import { MAX_REPORT_ATTACHMENT_BYTES, type AttachmentRequest, type AttachmentResponse } from './attachments';

export async function uploadReportFile(file: File, id: string, request: (input: AttachmentRequest) => Promise<AttachmentResponse>, onProgress: (percent: number) => void, signal?: AbortSignal) {
  if (!file.size || file.size > MAX_REPORT_ATTACHMENT_BYTES) throw new Error('Il file deve pesare al massimo 5 MB e non essere vuoto.');
  signal?.throwIfAborted();
  const result = await request({ operation: 'begin_upload', scope: 'report', id, name: file.name, size: file.size });
  if (result.completed) { onProgress(100); return; }
  if (!result.upload) throw new Error('Impossibile avviare il caricamento del file.');
  const config = result.upload;
  const { Upload } = await import('tus-js-client');
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { void upload.abort(); reject(new Error('Caricamento annullato.')); };
    const finish = (error?: Error) => { signal?.removeEventListener('abort', abort); if (error) reject(error); else resolve(); };
    const upload = new Upload(file, {
      endpoint: config.endpoint,
      headers: { 'x-signature': config.token, 'x-upsert': 'false' },
      metadata: { bucketName: config.bucket, objectName: config.path, contentType: config.contentType, cacheControl: '3600' },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000],
      storeFingerprintForResuming: false,
      removeFingerprintOnSuccess: true,
      uploadDataDuringCreation: true,
      onProgress: (sent, total) => onProgress(Math.min(99, Math.floor(sent / total * 100))),
      onError: () => finish(new Error('Caricamento file interrotto. Riprova con Completa invio.')),
      onSuccess: () => finish(),
    });
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else upload.start();
  });
  signal?.throwIfAborted();
  await request({ operation: 'complete_upload', scope: 'report', id });
  onProgress(100);
}
