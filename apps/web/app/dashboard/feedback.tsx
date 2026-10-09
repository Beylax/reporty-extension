import { FeedbackToast } from '@/components/feedback-toast';

const messages: Record<string, string> = {
  'github-connected': 'GitHub collegato. Carica le repository e scegli il branch per l’ambiente.',
  'github-error': 'Collegamento GitHub non riuscito o scaduto. Riprova.',
  'github-config': 'Configura la GitHub App e le credenziali di integrazione sul server.',
  'github-repository-error': 'Repository o branch non accessibili. Ricollega GitHub e verifica i permessi in scrittura.',
  'claude-locked': 'Claude sta lavorando a una segnalazione di questo ambiente. Attendi il completamento.',
  'invalid-name': 'Inserisci un nome valido entro il limite indicato.',
  'invalid-origin': 'Inserisci un’origine completa, per esempio https://example.com o http://localhost:3000, senza percorso, query o credenziali.',
  'duplicate-origin': 'Questo dominio è già presente nel progetto.',
  'save-error': 'Salvataggio non riuscito. Verifica i permessi e che lo schema del database sia aggiornato.',
  'signout-error': 'Uscita non riuscita. Riprova.',
  created: 'Progetto creato con ambiente Produzione e link ospite.',
  saved: 'Modifiche salvate.',
};

export function Feedback({ message }: { message?: string }) {
  if (!message || !messages[message]) return null;
  const success = message === 'created' || message === 'saved' || message === 'github-connected';
  return <FeedbackToast key={message} message={messages[message]} type={success ? 'success' : 'error'} />;
}
