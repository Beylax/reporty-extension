import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Resolve the workspace package entry to its source for Node's native TypeScript runner.
const source=await readFile(new URL('../apps/web/lib/report-table-order.ts',import.meta.url),'utf8');
const orderModule=new URL('../packages/shared/src/report-order.ts',import.meta.url).href;
const executable=stripTypeScriptTypes(source).replace("from '@reporty/shared'",`from '${orderModule}'`);
const {compareReportTableRows}=await import('data:text/javascript;base64,'+Buffer.from(executable).toString('base64'));
const environmentNames=new Map([['env-1','Staging'],['env-2','Produzione']]);
const reports=[
  {id:'a',body:'Elemento 10',authorName:'Zoe',environment_id:'env-2',page_path:'/page/10',status:'open',priority:'low',created_at:'2026-10-01T10:00:00Z',updated_at:null},
  {id:'b',body:'elemento 2',authorName:'Anna',environment_id:'env-2',page_path:'/page/2',status:'resolved',priority:'high',created_at:'2026-10-02T10:00:00Z',updated_at:'2026-10-03T10:00:00Z'},
  {id:'c',body:'Altro',authorName:'Èva',environment_id:'env-1',page_path:'/',status:'validation',priority:'medium',created_at:'2026-10-03T10:00:00Z',updated_at:'2026-10-04T10:00:00Z'},
];
const order=(field,direction)=>[...reports].sort((a,b)=>compareReportTableRows(a,b,{field,direction},environmentNames)).map(item=>item.id);
test('table headings sort description and author naturally in either direction',()=>{
  assert.deepEqual(order('body','asc'),['c','b','a']);
  assert.deepEqual(order('body','desc'),['a','b','c']);
  assert.deepEqual(order('authorName','asc'),['b','c','a']);
  assert.deepEqual(order('authorName','desc'),['a','c','b']);
});
test('environment sorting uses the displayed name and page path, rather than UUIDs',()=>{
  assert.deepEqual(order('environment','asc'),['b','a','c']);
  assert.deepEqual(order('environment','desc'),['c','a','b']);
});
test('table headings preserve priority, status and date ordering, with missing updates last',()=>{
  assert.deepEqual(order('status','asc'),['a','c','b']);
  assert.deepEqual(order('priority','asc'),['b','c','a']);
  assert.deepEqual(order('created_at','desc'),['c','b','a']);
  assert.deepEqual(order('updated_at','asc'),['b','c','a']);
  assert.deepEqual(order('updated_at','desc'),['c','b','a']);
});
test('equal column values have a stable ordering',()=>{
  const a={...reports[0],body:'Parità',created_at:'2026-10-01T10:00:00Z'};
  const b={...a,id:'b'};
  for(const direction of ['asc','desc']) assert.ok(compareReportTableRows(a,b,{field:'body',direction},environmentNames)<0);
});
