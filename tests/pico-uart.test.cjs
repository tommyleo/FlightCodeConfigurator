const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('app.js','utf8');
const nodes=new Map();
const $=id=>{if(!nodes.has(id))nodes.set(id,{id:id.slice(1),value:'',textContent:'',options:[],replaceChildren(...options){this.options=options;}});return nodes.get(id)};
const state={board:'PICO2_W',connected:true};
const buttons=Object.fromEntries(['applyReceiver','saveReceiver','applyVtx','saveVtx'].map(k=>[k,{}]));
const ctx={state,buttons,$,receiverConfig:{},vtxConfig:{table:'DEFAULT'},updateReceiverBindControls(){},hasCapability:()=>true,vtxTables:{HDZERO:{R:[5658]},DEFAULT:{R:[5658]}},Option:function(text,value){this.text=text;this.value=value},setValidationError(){},renderVtxTable(){}};
vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function setSerialPorts('),source.indexOf('function receiverCommand(')),ctx);
$('#receiverProtocol').value='ELRS';$('#vtxProtocol').value='HDZERO_MSP';
ctx.setSerialPorts(['UART1','UART2']);
for(const id of ['#receiverSerialPort','#vtxSerialPort'])assert.deepEqual($(id).options.map(o=>o.value),['UART1','UART2']);
for(const [rx,tx] of [['UART1','UART2'],['UART2','UART1']]){
 $('#receiverSerialPort').value=rx;$('#vtxSerialPort').value=tx;ctx.validateSerialAssignments();
 assert.equal(buttons.applyReceiver.disabled,false);assert.equal(buttons.applyVtx.disabled,false);
}
for(const port of ['UART1','UART2']){
 $('#receiverSerialPort').value=port;$('#vtxSerialPort').value=port;ctx.validateSerialAssignments();
 assert.equal(buttons.applyReceiver.disabled,true);assert.equal(buttons.applyVtx.disabled,true);
 $('#vtxProtocol').value='OFF';ctx.validateSerialAssignments();
 assert.equal(buttons.applyReceiver.disabled,false);assert.equal(buttons.applyVtx.disabled,false);
 $('#vtxProtocol').value='HDZERO_MSP';
}
ctx.setSerialPorts(['PIO0','UART1']);
assert.deepEqual($('#receiverSerialPort').options.map(o=>o.value),['PIO0']);
assert.deepEqual($('#vtxSerialPort').options.map(o=>o.value),['UART1']);
ctx.validateSerialAssignments();assert.equal(buttons.applyVtx.disabled,false);
assert.equal(fs.readFileSync('android/app/src/main/assets/configurator/app.js','utf8'),source);
console.log('Pico selectable ports, both assignments, conflict guards, VTX-off swap, legacy firmware and Android parity: PASS');
