export default defineContentScript({
  matches: [`${new URL(process.env.WXT_API_URL ?? 'http://localhost:3000').protocol}//${new URL(process.env.WXT_API_URL ?? 'http://localhost:3000').hostname}/guest/*`],
  main(ctx) {
    const listener = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'REPORTY_GUEST_PREPARE' || typeof event.data.requestId !== 'string' || event.data.requestId.length > 80) return;
      const requestId = event.data.requestId;
      void browser.runtime.sendMessage({ type: 'REPORTY_GUEST_PREPARE' }).then(response => {
        window.postMessage({ type: 'REPORTY_GUEST_READY', requestId, ...response }, location.origin);
      }).catch(() => window.postMessage({ type: 'REPORTY_GUEST_READY', requestId, ok: false }, location.origin));
    };
    window.addEventListener('message', listener);
    ctx.onInvalidated(() => window.removeEventListener('message', listener));
  },
});
