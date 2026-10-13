import { handleAttachment } from '@/lib/attachments';
import { validToken } from '@/lib/invitation-token';
export async function POST(request: Request) {
  const secret = request.headers.get('authorization')?.replace(/^Bearer /,'') ?? '';
  if (!validToken(secret)) return Response.json({ error: 'Sessione richiesta.' }, { status: 401 });
  return handleAttachment(request,secret);
}
