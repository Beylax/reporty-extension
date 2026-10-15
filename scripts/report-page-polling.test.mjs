import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

// Execute the real hook with a small hook host; no browser or server is needed.
const source = stripTypeScriptTypes(await readFile(new URL('../packages/shared/ui/use-report-page.tsx',import.meta.url),'utf8'))
  .replace(/import .* from 'react';/, 'const { useCallback, useEffect, useEffectEvent, useRef, useState } = hooks;')
  .replace('export function useReportPage','function useReportPage');
const createHook = new Function('hooks',source+'\nreturn useReportPage;');
const flush = () => new Promise(resolve => setTimeout(resolve,0));
const deferred = () => { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
const page = (offset=0,length=20,total=100) => ({reports:Array.from({length},(_,index)=>({id:String(offset+index)})),total,projectTotal:total,pages:['/']});
function host(load,{infinite=false}={}) {
  const slots=[]; let updates=0,index=0,dirty=false,effects=[],query={offset:0,limit:20},value;
  const errors=[];
  const hooks={
    useState(initial){const slot=index++;if(!(slot in slots))slots[slot]=initial;return [slots[slot],next=>{updates++;slots[slot]=typeof next==='function'?next(slots[slot]):next;dirty=true;}];},
    useRef(initial){const slot=index++;return slots[slot]??=( {current:initial} );},
    useEffect(callback,deps){const slot=index++;const old=slots[slot];if(!old||deps.some((item,i)=>!Object.is(item,old.deps[i]))){effects.push(()=>{old?.cleanup?.();slots[slot]={deps,cleanup:callback()};});}},
    useCallback(callback){return callback;},
    useEffectEvent(callback){const latest=hooks.useRef(callback);latest.current=callback;return (...args)=>latest.current(...args);},
  };
  const useHook=createHook(hooks);
  return {
    get value(){return value;},get updates(){return updates;},errors,
    render(next=query){query=next;do{dirty=false;index=0;effects=[];value=useHook(query,load,{infinite,scope:'env',onError:error=>errors.push(error)});effects.forEach(effect=>effect());}while(dirty);return value;},
    close(){for(const slot of slots)slot?.cleanup?.();},
  };
}

test('polling retains visible rows and never enables loading; explicit refresh still does',async()=>{
  const requests=[];
  const h=host(query=>{const next=deferred();requests.push({query,...next});return next.promise;});
  try {
    assert.equal(h.render().loading,true);await flush();requests[0].resolve(page());await flush();h.render();
    assert.equal(h.value.loading,false);
    const poll=h.value.poll();h.render();assert.equal(h.value.loading,false);assert.equal(h.value.reports.length,20);
    requests[1].resolve(page(0,20,105));await poll;h.render();assert.equal(h.value.total,105);assert.equal(h.value.loading,false);
    h.value.refresh();h.render();assert.equal(h.value.loading,true);await flush();
    requests[2].resolve(page());await flush();h.render();assert.equal(h.value.loading,false);
  }finally{h.close();}
});

test('a filter change wins over an earlier background response',async()=>{
  const slow=deferred();let calls=0;
  const h=host(async query=>{calls++;return calls===2?slow.promise:page(query.offset);});
  try {
    h.render();await flush();h.render();
    const poll=h.value.poll();
    h.render({offset:20,limit:20});assert.equal(h.value.loading,true);await flush();h.render();
    assert.equal(h.value.reports[0].id,'20');
    slow.resolve(page());await poll;h.render();assert.equal(h.value.reports[0].id,'20');assert.equal(h.value.loading,false);
  }finally{h.close();}
});

test('Kanban polls only loaded batches and lets a user load more during polling',async()=>{
  const requests=[];let background=false;
  const h=host(query=>{const request={query};requests.push(request);if(background&&query.offset<40){const next=deferred();Object.assign(request,next);return next.promise;}return Promise.resolve(page(query.offset));},{infinite:true});
  try {
    h.render();await flush();h.render();await h.value.loadMore();h.render();assert.equal(h.value.reports.length,40);
    background=true;const poll=h.value.poll();h.render();assert.equal(h.value.loading,false);
    assert.deepEqual(requests.slice(2).map(item=>item.query.offset),[0,20]);
    await h.value.poll();assert.equal(requests.length,4);
    const more=h.value.loadMore();h.render();assert.equal(h.value.loading,true);await more;h.render();assert.equal(h.value.reports.length,60);
    requests[2].resolve(page());requests[3].resolve(page(20));await poll;h.render();assert.equal(h.value.reports.length,60);
  }finally{h.close();}
});

test('a failed poll keeps existing data and reports consecutive failures only once',async()=>{
  let fail=false;const h=host(async()=>{if(fail)throw new Error('offline');return page();});
  try {
    h.render();await flush();h.render();fail=true;
    await h.value.poll();h.render();await h.value.poll();h.render();
    assert.equal(h.value.reports.length,20);assert.equal(h.value.loading,false);assert.equal(h.value.failed,false);assert.deepEqual(h.errors,['offline']);
    fail=false;await h.value.poll();h.render();fail=true;await h.value.poll();assert.deepEqual(h.errors,['offline','offline']);
  }finally{h.close();}
});

test('leaving the view ignores a background response even after loading more',async()=>{
  let background=false;const slow=deferred();
  const h=host(async query=>background?slow.promise:page(query.offset),{infinite:true});
  h.render();await flush();h.render();await h.value.loadMore();h.render();
  background=true;const poll=h.value.poll();h.close();const updates=h.updates;
  slow.resolve(page());await poll;assert.equal(h.updates,updates);
});
