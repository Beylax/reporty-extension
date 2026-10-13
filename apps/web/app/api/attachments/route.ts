import { handleAttachment } from '@/lib/attachments';
export async function POST(request: Request) { return handleAttachment(request,null); }
