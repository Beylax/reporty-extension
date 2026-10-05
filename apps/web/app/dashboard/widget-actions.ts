'use server';
import { revalidatePath } from 'next/cache';
import { isUuid } from '@reporty/shared';
import { requireUser } from '@/lib/auth';
export async function toggleWidget(environmentId:string,enabled:boolean) {
  if(!isUuid(environmentId)||typeof enabled!=='boolean')return {error:'Dati non validi.'};
  const {supabase}=await requireUser();
  const {data,error}=await supabase.from('environment_widgets').update({enabled}).eq('environment_id',environmentId).select('environment_id').maybeSingle();
  if(error||!data)return {error:'Impossibile aggiornare lo script. Verifica lo schema widget.'};
  revalidatePath('/dashboard','layout');return {success:true};
}
