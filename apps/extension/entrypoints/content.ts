import { ToastProvider } from '@/components/ui/toast';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Site, Environment } from '@/lib/session';
import { ReviewOverlay } from '@/components/review-overlay';
import css from '@/entrypoints/popup/style.css?inline';

export default defineContentScript({
  matches: [], registration: 'runtime',
  main(ctx) {
    if (document.getElementById('reporty-overlay')) return;
    const host = document.createElement('div'); host.id = 'reporty-overlay';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = css.replaceAll(':root', ':host') + ':host{font:14px/1.5 system-ui;color:#171717}';
    const mount = document.createElement('div'); shadow.append(style, mount);
    const root = createRoot(mount);
    let disposed = false;
    let refreshVersion = 0;
    async function refresh() {
      const version = ++refreshVersion;
      try {
        const response = await browser.runtime.sendMessage({ type: 'REPORTY_PAGE' });
        if (disposed || version !== refreshVersion) return;
        const data = response?.ok ? response.data as { site: Site; environment: Environment } | null : null;
        root.render(data ? React.createElement(ToastProvider, { children: React.createElement(ReviewOverlay, { ...data, host }) }) : null);
      } catch { if (!disposed && version === refreshVersion) root.render(null); }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const listener = (message: { type?: string }, _sender: unknown, sendResponse: (response: { ok: boolean }) => void) => {
      if (message.type !== 'REPORTY_REFRESH') return;
      void refresh().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true;
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { disposed = true; clearInterval(timer); browser.runtime.onMessage.removeListener(listener); root.unmount(); host.remove(); });
  },
});
