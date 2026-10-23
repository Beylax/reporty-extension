import assert from 'node:assert/strict';
import test from 'node:test';
import { screenshotSelection, cropScreenshot } from '../apps/extension/lib/screenshot-selection.ts';

test('rectangles normalize drag direction and clamp to the visible page', () => {
  assert.deepEqual(screenshotSelection('rectangle',[{x:400,y:300},{x:-20,y:100}],600,400),{path:'M0 100H400V300H0Z',x:0,y:100,width:400,height:200});
  assert.equal(screenshotSelection('rectangle',[{x:10,y:10},{x:12,y:20}],600,400),null);
});
test('circles stay circular in all drag directions and full screen means the viewport', () => {
  for (const point of [{x:300,y:250},{x:100,y:250},{x:100,y:100},{x:300,y:100}]) {
    const circle = screenshotSelection('circle',[{x:200,y:200},point],600,400);
    assert.equal(circle.width,circle.height);
    assert.ok(circle.x>=0 && circle.y>=0 && circle.x+circle.width<=600 && circle.y+circle.height<=400);
    assert.match(circle.path,/A/);
  }
  assert.deepEqual(screenshotSelection('screen',[],600,400),{path:'M0 0H600V400H0Z',x:0,y:0,width:600,height:400});
});
test('freehand keeps the traced contour and rejects incomplete selections', () => {
  const points=[{x:10,y:20},{x:110,y:20},{x:60,y:80}];
  assert.deepEqual(screenshotSelection('freehand',points,600,400),{path:'M10 20L110 20L60 80Z',x:10,y:20,width:100,height:60});
  assert.equal(screenshotSelection('freehand',points.slice(0,2),600,400),null);
  assert.equal(screenshotSelection('freehand',[{x:10,y:10},{x:20,y:20},{x:30,y:30}],600,400),null);
});
test('crop maps viewport coordinates to image pixels and clips the clean source, excluding backdrop', () => {
  const calls=[];
  const canvas={width:0,height:0,getContext:()=>({fillRect:(...args)=>calls.push(['fill',...args]),scale:(...args)=>calls.push(['scale',...args]),translate:(...args)=>calls.push(['translate',...args]),clip:(path,rule)=>calls.push(['clip',path.value,rule]),drawImage:(...args)=>calls.push(['draw',...args])}),toDataURL:()=> 'data:image/jpeg;base64,YWJj'};
  globalThis.document={createElement:()=>canvas};
  globalThis.Path2D=class {constructor(value){this.value=value;}};
  const selection=screenshotSelection('rectangle',[{x:20,y:30},{x:120,y:80}],600,400);
  const source={naturalWidth:1200,naturalHeight:800};
  const output=cropScreenshot(source,selection,{width:600,height:400});
  assert.equal(output.width,200);assert.equal(output.height,100);
  assert.deepEqual(calls,[['fill',0,0,200,100],['scale',2,2],['translate',-20,-30],['clip',selection.path,'evenodd'],['draw',source,0,0,600,400]]);
});
