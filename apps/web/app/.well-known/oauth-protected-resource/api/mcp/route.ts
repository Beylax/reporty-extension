import { protectedResourceMetadata } from '@/lib/mcp/auth';
export function GET() { return Response.json(protectedResourceMetadata(), { headers: { 'Cache-Control': 'no-store' } }); }
