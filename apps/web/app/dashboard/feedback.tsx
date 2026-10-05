import { FeedbackToast } from '@/components/feedback-toast';

const messages: Record<string, string> = {
  'invalid-name': 'Inserisci un nome valido entro il limite indicato.',
  'invalid-origin': 'Inserisci un’origine completa, per esempio https://example.com o http://localhost:3000, senza percorso, query o credenziali.',
  'duplicate-origin': 'Questo dominio è già presente nel progetto.',
  'save-error': 'Salvataggio non riuscito. Verifica i permessi e che la migrazione di gestione progetti sia stata applicata.',
  'signout-error': 'Uscita non riuscita. Riprova.',
  created: 'Progetto creato. Aggiungi il primo ambiente.',
  saved: 'Modifiche salvate.',
};

export function Feedback({ message }: { message?: string }) {
  if (!message || !messages[message]) return null;
  const success = message === 'created' || message === 'saved';
  return <FeedbackToast key={message} message={messages[message]} type={success ? 'success' : 'error'} />;
}
