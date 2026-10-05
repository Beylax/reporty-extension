import { createProject } from '../actions';
import { Feedback } from '../feedback';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubmitButton } from '@/components/submit-button';

export default async function NewProject({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { message } = await searchParams;
  return <main className="mx-auto w-full max-w-3xl space-y-6 px-6 py-10 lg:px-10">
    <h1 className="text-3xl font-semibold tracking-tight">Nuovo progetto</h1>
    <Feedback message={message} />
    <Card><CardHeader><CardTitle>Un workspace per il tuo sito</CardTitle><CardDescription>Inserisci il sito: creeremo l’ambiente Produzione e il suo link per gli ospiti. Il progetto sarà condiviso con tutti gli sviluppatori.</CardDescription></CardHeader>
    <CardContent><form action={createProject} className="grid gap-5"><div className="grid gap-2"><Label htmlFor="name">Nome progetto</Label><Input id="name" name="name" placeholder="Sito aziendale" required maxLength={120} autoFocus /></div><div className="grid gap-2"><Label htmlFor="origin">Origine del sito web</Label><Input id="origin" name="origin" type="url" placeholder="https://example.com" required aria-describedby="origin-help" /><p id="origin-help" className="text-sm text-muted-foreground">Protocollo e dominio, senza percorso. Per localhost includi la porta.</p></div><div><SubmitButton>Crea progetto</SubmitButton></div></form></CardContent></Card>
  </main>;
}
