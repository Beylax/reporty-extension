'use client';

import { Button } from '@/components/ui/button';

export default function DashboardError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl space-y-4 px-6 py-20">
    <h1 className="text-2xl font-semibold">Impossibile caricare i progetti</h1>
    <p className="text-muted-foreground">Verifica la connessione e la configurazione del database, poi riprova.</p>
    <Button onClick={reset}>Riprova</Button>
  </main>;
}
