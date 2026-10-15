import { createClient } from '@/lib/supabase/server';
import { isUuid, validateName } from '@reporty/shared';
import { widgetOriginAllowed } from '@/lib/widget-origin';
import { newToken, validToken } from '@/lib/invitation-token';
import { POST as reports } from '../extension/reports/route';
import { POST as attachment } from '../extension/attachments/route';
import { POST as screenshot } from '../extension/screenshot/route';
import { POST as identity } from '../extension/context/route';

function cors(response: Response, origin: string) {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Vary', 'Origin');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export function OPTIONS(request: Request) {
  const origin = request.headers.get('origin') ?? '';
  if (!/^https?:\/\//.test(origin)) return new Response(null,{status:403});
  const response = cors(new Response(null,{status:204}),origin);
  response.headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers','Content-Type,Authorization');
  return response;
}
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key') ?? '';
  const origin = request.headers.get('origin') ?? '';
  if (!isUuid(key)) return new Response(null,{status:400});
  const supabase = await createClient();
  const {data,error} = await supabase.rpc('widget_config',{key});
  if (error || !data || !widgetOriginAllowed(data.environment.origin, origin)) return new Response(null,{status:403});
  return cors(Response.json(data),origin);
}
export async function POST(request: Request) {
  const origin=request.headers.get('origin') ?? '';
  let input;
  try { input=await request.json(); } catch { return new Response(null,{status:400}); }
  if (!input || typeof input !== 'object') return new Response(null,{status:400});
  const supabase=await createClient();
  if (input.action==='start') {
    if (!isUuid(String(input.key))) return cors(Response.json({error:'Script non valido.'},{status:400}),origin);
    let name: string | null = null;
    try { if (Object.hasOwn(input,'name')) name=validateName(input.name,80); } catch { return cors(Response.json({error:'Inserisci il tuo nome.'},{status:400}),origin); }
    const token=newToken();
    const {error}=await supabase.rpc('start_widget_session',{key:input.key,request_origin:origin,guest_name:name,session_secret:token});
    return cors(Response.json(error ? {error:'Segnalazioni disabilitate o sito non autorizzato.'} : {token},{status:error?403:200}),origin);
  }
  const secret=request.headers.get('authorization')?.replace(/^Bearer /,'') ?? '';
  if (!validToken(secret)) return cors(Response.json({error:'Sessione non disponibile. Riapri il pannello.'},{status:401}),origin);
  const {data:environmentId,error}=await supabase.rpc('widget_authorize',{secret,request_origin:origin});
  if(error || !environmentId) return cors(Response.json({error:'Segnalazioni disabilitate o sessione scaduta.',code:'WIDGET_SESSION_INVALID'},{status:403}),origin);
  const body=input.action==='attachment' ? {...input.payload,environmentId} : {...input,environmentId};
  const forwarded=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},body:JSON.stringify(body)});
  return cors(await (input.action==='identity' ? identity(forwarded) : input.action==='screenshot' ? screenshot(forwarded) : input.action==='attachment' ? attachment(forwarded) : reports(forwarded)),origin);
}
