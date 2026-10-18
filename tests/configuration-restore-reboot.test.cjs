const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const start=source.indexOf("$('#configurationBackupFile').onchange=");
const end=source.indexOf('updateConfigurationBackupControls();',start);
async function load({restoreFails=false,sendFails=false}={}){
  const events=[],elements={},errors=[];
  const context={
    $:id=>elements[id]??=( {} ),
    state:{board:'SEQUREH7V2',connected:true,writer:{},osdDirty:true,blackboxDirty:true},
    FlightCodeConfigurationBackup:{parse:()=>({board:'SEQUREH7V2'})},confirm:()=>true,
    configurationBackupClient:{restore:async()=>{events.push('saved-and-verified');if(restoreFails)throw Error('Verification failed')}},
    send:async command=>{events.push(command);if(sendFails)throw Error('USB write failed')},
    toast:()=>{},showError:message=>errors.push(message)
  };
  vm.runInNewContext(source.slice(start,end),context);
  await elements['#configurationBackupFile'].onchange({target:{files:[{size:20,text:async()=>'{}'}]}});
  return {events,errors,state:context.state};
}
test('successful load reboots once after save and verification',async()=>{
  const result=await load();assert.deepEqual(result.events,['saved-and-verified','REBOOT']);assert.deepEqual(result.errors,[]);assert.equal(result.state.osdDirty,false);
});
test('failed restore never reboots',async()=>{
  const result=await load({restoreFails:true});assert.deepEqual(result.events,['saved-and-verified']);assert.match(result.errors[0],/Verification failed/);
});
test('reboot failure reports that settings were already restored',async()=>{
  const result=await load({sendFails:true});assert.match(result.errors[0],/restored and verified.*automatic reboot failed.*manually/);
});
