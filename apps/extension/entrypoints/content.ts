import type { Site, Environment } from '@/lib/session';

export default defineContentScript({
  matches: [],
  registration: 'runtime',
  main(ctx) {
    if (document.getElementById('reporty-overlay')) return;
    const host = document.createElement('div');
    host.id = 'reporty-overlay';
    document.documentElement.append(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = ':host{all:initial}.button{position:fixed;z-index:2147483647;width:52px;height:52px;border-radius:50%;border:1px solid #fff;background:#171717;color:#fff;font:28px system-ui;box-shadow:0 6px 24px #0003;cursor:pointer}.button:focus-visible{outline:3px solid #6366f1;outline-offset:3px}.panel{position:fixed;z-index:2147483647;max-width:280px;padding:18px;border:1px solid #ddd;border-radius:12px;background:white;color:#171717;box-shadow:0 6px 24px #0003;font:14px/1.5 system-ui}';
    const button = document.createElement('button');
    button.className = 'button'; button.textContent = '+'; button.setAttribute('aria-label', 'Apri Reporty');
    const panel = document.createElement('div'); panel.className = 'panel'; panel.hidden = true; panel.setAttribute('role', 'status');
    shadow.append(style, button, panel);
    let environment: Environment | null = null;
    button.addEventListener('click', () => { panel.hidden = !panel.hidden; });
    async function refresh() {
      try {
        const result = await browser.runtime.sendMessage({ type: 'REPORTY_PAGE' });
        const data = result?.ok ? result.data as { site: Site; environment: Environment } | null : null;
        button.hidden = !data;
        if (!data) { panel.hidden = true; return; }
        environment = data.environment;
        const top = data.site.position.startsWith('top'); const left = data.site.position.endsWith('left');
        button.style.cssText = `${top ? 'top' : 'bottom'}:24px;${left ? 'left' : 'right'}:24px`;
        panel.style.cssText = `${top ? 'top' : 'bottom'}:88px;${left ? 'left' : 'right'}:24px`;
        panel.textContent = `${environment.projectName} · ${environment.name}. Collegamento attivo. La creazione delle segnalazioni sarà disponibile nel prossimo passaggio.`;
      } catch { button.hidden = true; panel.hidden = true; }
    }
    button.hidden = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const listener = (message: { type?: string }) => { if (message.type === 'REPORTY_REFRESH') void refresh(); };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { clearInterval(timer); browser.runtime.onMessage.removeListener(listener); host.remove(); });
  },
});
