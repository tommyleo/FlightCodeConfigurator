const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const branch=source.match(/  if\(p\[1\]==="VTX_LINK_STATUS"[^\n]+/);
assert.ok(branch,'live link status parser exists');
const nodes={ '#vtxLinkState':{textContent:''}, '#vtxConfigState':{textContent:'Unsaved changes'} };
const handle=vm.runInNewContext(`(function(p){${branch[0]}})`,{$:id=>nodes[id]});
for(const [status,expected] of [
    ['INITIALIZING','Waiting for HDZero communication'],
    ['MSP_CONNECTED','HDZero connected; waiting to send settings'],
    ['MSP_SETTINGS_SENT','HDZero connected; channel and power settings sent'],
    ['NO_RESPONSE','No HDZero response. Check VTX power and both UART wires.'],
    ['INVALID_SETTINGS','Selected HDZero channel or power is unsupported'],
]) {
    handle(['@CFG','VTX_LINK_STATUS',status]);
    assert.equal(nodes['#vtxLinkState'].textContent,expected);
    assert.equal(nodes['#vtxConfigState'].textContent,'Unsaved changes');
}
handle(['@CFG','VTX_LINK_STATUS','NEW_STATUS']);
assert.equal(nodes['#vtxLinkState'].textContent,'HDZero status: NEW_STATUS');
for(const file of ['app.js','index.html'])
    assert.equal(fs.readFileSync(file,'utf8'),fs.readFileSync(`android/app/src/main/assets/configurator/${file}`,'utf8'));
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/FC TX to VTX RX and FC RX to VTX TX/);
assert.match(html,/MSP connection confirms communication, not the actual RF state/);
console.log('HDZero live status preserves local edits and Android matches web: PASS');
