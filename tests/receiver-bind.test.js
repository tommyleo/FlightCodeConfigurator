const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf('function updateReceiverBindControls(){');
const end=source.indexOf('\nfunction setReceiverProtocols(',start);
assert.ok(start>=0&&end>start);
const nodes={
  '#receiverProtocol':{value:'SBUS'}, '#receiverSerialPort':{value:'UART4'},
  '#receiverBindRow':{}, '#bindReceiverButton':{},
};
const state={connected:true,activeReceiverProtocol:'ELRS',activeReceiverPort:'UART4',armed:false,motorTest:false};
const pidDiagnostic={running:false};
let supported=true;
const context={state,pidDiagnostic,$:id=>nodes[id],hasCapability:()=>supported};
const update=vm.runInNewContext(`(${source.slice(start,end)})`,context);
update(); assert.equal(nodes['#receiverBindRow'].hidden,true); assert.equal(nodes['#bindReceiverButton'].disabled,true);
nodes['#receiverProtocol'].value='ELRS'; update();
assert.equal(nodes['#receiverBindRow'].hidden,false);
assert.equal(nodes['#bindReceiverButton'].disabled,false);
for(const key of ['armed','motorTest']){
  state[key]=true; update(); assert.equal(nodes['#bindReceiverButton'].disabled,true);
  state[key]=false;
}
pidDiagnostic.running=true; update(); assert.equal(nodes['#bindReceiverButton'].disabled,true);
pidDiagnostic.running=false;
state.connected=false; update(); assert.equal(nodes['#bindReceiverButton'].disabled,true);
state.connected=true; supported=false; update(); assert.equal(nodes['#bindReceiverButton'].disabled,true);
supported=true; state.activeReceiverProtocol='SBUS'; update(); assert.equal(nodes['#bindReceiverButton'].disabled,true);
state.activeReceiverProtocol='ELRS'; state.activeReceiverPort='UART1'; update(); assert.equal(nodes['#bindReceiverButton'].disabled,true);
state.activeReceiverPort='UART4'; update(); assert.equal(nodes['#bindReceiverButton'].disabled,false);
const clickStart=source.indexOf('$("#bindReceiverButton").onclick=');
const clickEnd=source.indexOf('\nbuttons.applyReceiver.onclick=',clickStart);
const sent=[];
context.updateReceiverBindControls=update; context.send=async command=>sent.push(command);
context.showError=()=>assert.fail('unexpected send error');
vm.runInNewContext(source.slice(clickStart,clickEnd),context);
(async()=>{
  await nodes['#bindReceiverButton'].onclick(); assert.deepEqual(sent,['BIND_RECEIVER']);
  state.armed=true;
  await nodes['#bindReceiverButton'].onclick(); assert.deepEqual(sent,['BIND_RECEIVER']);
  const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('styles.css','utf8');
  assert.match(html,/id="receiverBindRow"[^>]*hidden/);
  assert.match(css,/#receiverBindRow\[hidden\]\{display:none\}/);
  for(const file of ['app.js','index.html','styles.css'])
    assert.equal(fs.readFileSync(file,'utf8'),fs.readFileSync(`android/app/src/main/assets/configurator/${file}`,'utf8'));
  console.log('ELRS visibility, applied UART, firmware support, safety guards and Android parity: PASS');
})().catch(error=>{console.error(error);process.exitCode=1});
