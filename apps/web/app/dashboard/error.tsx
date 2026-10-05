'use client';

import { FeedbackToast } from '@/components/feedback-toast';
import { Button } from '@/components/ui/button';

export default function DashboardError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl space-y-4 px-6 py-20">
    <h1 className="text-2xl font-semibold">Impossibile caricare i progetti</h1>
    <FeedbackToast message="Verifica la connessione e la configurazione del database, poi riprova." />
    <Button onClick={reset}>Riprova</Button>
  </main>;
}
