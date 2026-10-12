import Link from 'next/link';
import { Database, HardDrive, Image as ScreenshotIcon, Activity, ExternalLink } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getSupabaseAudit } from '@/lib/supabase/audit';
import { FREE_DATABASE_BYTES, FREE_STORAGE_BYTES, quotaStatus } from '@/lib/supabase/audit-data';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { FeedbackToast } from '@/components/feedback-toast';
import { RefreshAudit } from './refresh';

function bytes(value: number | null) {
  if (value === null) return 'Non disponibile';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toLocaleString('it-IT', { maximumFractionDigits: 2 })} GB`;
  return `${(value / 1024 ** 2).toLocaleString('it-IT', { maximumFractionDigits: 2 })} MB`;
}
function date(value: string) { return new Date(value).toLocaleString('it-IT', { timeZone: 'Europe/Rome' }); }
function Usage({ used, limit }: { used: number | null; limit: number }) {
  const { percent, level } = quotaStatus(used, limit);
  return <div className="space-y-3"><p className="text-2xl font-semibold">{bytes(used)} <span className="text-sm font-normal text-muted-foreground">/ {bytes(limit)}</span></p>
    {percent !== null ? <><Progress label="Utilizzo rispetto alla soglia Free" value={Math.min(100,percent)} valueText={`${percent.toFixed(1)}%`} indicatorClassName={level === 'exceeded' ? 'bg-destructive' : level === 'warning' ? 'bg-amber-500' : 'bg-primary'} /><Badge variant={level === 'exceeded' ? 'destructive' : 'secondary'}>{percent.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% · {level === 'exceeded' ? 'Soglia raggiunta' : level === 'warning' ? 'Vicino alla soglia' : 'Entro la soglia'}</Badge></> : null}
  </div>;
}
export default async function AuditPage() {
  await requireUser();
  const audit = await getSupabaseAudit();
  return <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-10 lg:px-10">
    <Link href="/dashboard" className={buttonVariants({ variant: 'outline' })}>← Tutti i progetti</Link>
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="space-y-2"><h1 className="text-3xl font-semibold tracking-tight">Audit Supabase</h1><p className="text-muted-foreground">Utilizzo del progetto · Piano Free</p></div><RefreshAudit /></header>
    {!audit.configured ? <Card><CardHeader><CardTitle>Configura le metriche</CardTitle></CardHeader><CardContent>Imposta SUPABASE_ACCESS_TOKEN sul server e ripeti il deploy. Per un dominio Supabase personalizzato, imposta anche SUPABASE_PROJECT_REF.</CardContent></Card> : <>
      <p className="text-xs text-muted-foreground">Rilevazione: {date(audit.fetchedAt)}. Le metriche API possono arrivare in ritardo.</p>
      <div className="grid gap-5 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-4" />Database</CardTitle><CardDescription>Dati e indici di tutti i database del cluster; WAL escluso.</CardDescription></CardHeader><CardContent className="space-y-3"><Usage used={audit.database.data?.bytes ?? null} limit={FREE_DATABASE_BYTES} />{audit.database.error ? <><p className="text-xs text-muted-foreground">{audit.database.error}</p><FeedbackToast message={audit.database.error} /></> : null}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="size-4" />File Storage</CardTitle><CardDescription>Spazio attuale di tutti i bucket del progetto.</CardDescription></CardHeader><CardContent className="space-y-3"><Usage used={audit.storage.data?.bytes ?? null} limit={FREE_STORAGE_BYTES} />{audit.storage.error ? <><p className="text-xs text-muted-foreground">{audit.storage.error}</p><FeedbackToast message={audit.storage.error} /></> : null}<p className="text-xs text-muted-foreground">Confronto indicativo: la quota Storage è condivisa dall’organizzazione e l’utilizzo ufficiale è una media sul periodo di fatturazione.</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ScreenshotIcon className="size-4" aria-hidden="true" />Screenshot</CardTitle><CardDescription>Bucket privato screenshots, incluso nel File Storage.</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-2xl font-semibold">{bytes(audit.storage.data?.screenshot_bytes ?? null)}</p><p className="text-sm text-muted-foreground">{audit.storage.data?.screenshot_count?.toLocaleString('it-IT') ?? '—'} file · limite Reporty per immagine: 2,5 MB</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4" />Chiamate API</CardTitle><CardDescription>Il piano Free include richieste API illimitate.</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-2xl font-semibold">{audit.api.data?.total.toLocaleString('it-IT') ?? 'Non disponibile'}</p>{audit.api.data ? <><dl className="grid grid-cols-2 gap-2 text-sm">{[['Database REST',audit.api.data.rest],['Autenticazione',audit.api.data.auth],['Storage',audit.api.data.storage],['Realtime',audit.api.data.realtime]].map(([label,count]) => <div key={String(label)}><dt className="text-muted-foreground">{label}</dt><dd>{Number(count).toLocaleString('it-IT')}</dd></div>)}</dl><p className="text-xs text-muted-foreground">Intervallo dei campioni restituiti: {audit.api.data.from ? date(audit.api.data.from) : '—'} → {audit.api.data.to ? date(audit.api.data.to) : '—'}. Non è un totale mensile di fatturazione.</p></> : null}{audit.api.error ? <><p className="text-xs text-muted-foreground">{audit.api.error}</p><FeedbackToast message={audit.api.error} /></> : null}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Utilizzo ufficiale e traffico</CardTitle><CardDescription>Le chiamate illimitate non rendono illimitato il traffico: Free include 5 GB di egress e 5 GB di cached egress. Per quota condivisa, medie del periodo e restrizioni consulta Supabase.</CardDescription></CardHeader><CardContent><a className={buttonVariants({ variant: 'outline' })} href={`https://supabase.com/dashboard/project/${audit.ref}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />Apri Supabase</a></CardContent></Card>
    </>}
    <p className="text-xs text-muted-foreground">Soglie Free verificate il 12 ottobre 2026. <a className="underline" href="https://supabase.com/pricing" target="_blank" rel="noopener noreferrer">Limiti ufficiali</a></p>
  </main>;
}
