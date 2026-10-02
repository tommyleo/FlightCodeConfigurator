const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{value:'AUTO',checked:true,textContent:'',style:{setProperty(){}}});return elements.get(id)};
let renders=0;const commands=[];
const ctx=vm.createContext({$,state:{osdRows:16,osdDetectedMode:'PAL',osdDigital:false,osdDirty:false},renderOsdLayout(){renders++},hasCapability:()=>true,send:async cmd=>commands.push(cmd)});
function functionSource(name){return source.match(new RegExp('(async )?function '+name+'\\([^]*?\\n\\}'))[0]}
vm.runInContext(functionSource('setOsdVideoMode'),ctx);
vm.runInContext(source.match(/function markOsdDirty\(\)[^\n]+/)[0],ctx);
vm.runInContext(source.match(/\$\("#osdVideoMode"\)\.onchange=[^\n]+/)[0],ctx);
vm.runInContext(source.match(/async function applyOsdVideoMode\(\)[^\n]+/)[0],ctx);
(async()=>{
$('#osdVideoMode').value='NTSC';$('#osdVideoMode').onchange();assert.equal(ctx.state.osdRows,13);assert.equal(ctx.state.osdDirty,true);assert.match($('#osdGridFormat').textContent,/NTSC/);
await vm.runInContext('applyOsdVideoMode()',ctx);assert.deepEqual(commands,['SET_OSD_VIDEO_MODE NTSC']);
$('#osdVideoMode').value='PAL';$('#osdVideoMode').onchange();assert.equal(ctx.state.osdRows,16);
$('#osdVideoMode').value='AUTO';ctx.state.osdDetectedMode='NTSC';$('#osdVideoMode').onchange();assert.equal(ctx.state.osdRows,13);
ctx.hasCapability=()=>false;await vm.runInContext('applyOsdVideoMode()',ctx);assert.equal(commands.length,1);
ctx.hasCapability=()=>true;ctx.state.osdDigital=true;await vm.runInContext('applyOsdVideoMode()',ctx);assert.equal(commands.length,1);
assert.ok(renders>=3);console.log('OSD format selection, preview and firmware compatibility passed');
})().catch(e=>{console.error(e);process.exitCode=1});
