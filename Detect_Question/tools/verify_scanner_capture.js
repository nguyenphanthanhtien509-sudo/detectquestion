const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
 const port=fs.readFileSync(path.join(process.env.LOCALAPPDATA,'DetectQuestionBrowser','DevToolsActivePort'),'utf8').split('\n')[0];
 const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const tab=tabs.find(t=>t.type==='page'&&t.url.includes('baitaptracnghiem'));
 if(!tab)throw Error('Open the practice page in managed Chrome first.');
 const w=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>w.onopen=r);
 let seq=0;const pending=new Map();w.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}};
 const call=(method,params)=>new Promise(r=>{const id=++seq;pending.set(id,r);w.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const m=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(m.result?.exceptionDetails)throw Error(JSON.stringify(m.result.exceptionDetails));return m.result.result.value};
 try {
  for(const file of ['src/content/core/TextUtils.js','src/content/scanner/QuizCardScanner.js','src/content/ui/CaptureSelectionOverlay.js'])await evaluate(`(new Function(${JSON.stringify(fs.readFileSync(file,'utf8'))}))()`);
  const questions=await evaluate(`JSON.stringify(ExamDomScanner.scanAll().map(q=>({num:q.num,title:q.title,options:q.options?.map(o=>o.text)})))`);
  const parsed=JSON.parse(questions);assert.equal(parsed.length,30);assert.ok(parsed.every(q=>q.title.length>15));assert.match(parsed[0].title,/Xác định/);assert.equal(parsed[0].options.length,4);assert.ok(!parsed[0].title.includes('¬¬'));assert.ok(parsed[0].title.includes('\\neg'));
  console.log(JSON.stringify({count:parsed.length,first:parsed[0]}));
  const fixture=await evaluate(`(()=>{const root=document.createElement('div');root.innerHTML='<div id="question-fixture"><div id="question-fixture_question-name"><p>Câu 1:</p><p>First line of the problem.</p><p>Second line of the problem.</p></div><label><input type="radio">A. One</label><label><input type="radio">B. Two</label></div>';const q=QuizCardScanner.scan(root);return JSON.stringify(q.map(x=>({title:x.title,options:x.options.length})))})()`);
  assert.deepEqual(JSON.parse(fixture),[{title:'Câu 1:First line of the problem.Second line of the problem.',options:2}]);
  const overlay=await evaluate(`(async()=>{document.getElementById('qa-capture-selection-overlay')?.remove();const promise=CaptureSelectionOverlay.select();const el=document.getElementById('qa-capture-selection-overlay');const visible=el.children.length===2&&el.style.cursor==='crosshair';el.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:30,clientY:40,pointerId:1}));el.dispatchEvent(new PointerEvent('pointermove',{clientX:230,clientY:160,pointerId:1}));const width=el.firstChild.style.width;el.dispatchEvent(new PointerEvent('pointerup',{button:0,clientX:230,clientY:160,pointerId:1}));return {visible,width,rect:await promise,removed:!document.getElementById('qa-capture-selection-overlay')}})()`);
  assert.equal(overlay.visible,true);assert.equal(overlay.width,'200px');assert.equal(overlay.rect.height,120);assert.equal(overlay.removed,true);console.log('PASS: full stems, nested stem exclusion, all options, visible capture drag and cleanup');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
