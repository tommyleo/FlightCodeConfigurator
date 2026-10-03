const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const nodes=new Map();
const document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{value:'',textContent:'',style:{}});return nodes.get(selector)}};
const window={};
const context=vm.createContext({console,document,window,navigator:{usb:{}},setTimeout});
let source=fs.readFileSync('firmware-flasher.js','utf8');
// Exercise the actual private validation/page planning functions without a browser.
source=source.replace('window.firmwareFlasher={setDetectedBoard,updateReady};','window.testApi={TARGETS,state,ui,validateImage,sectorsForImage,Stm32DfuSession};window.firmwareFlasher={setDetectedBoard,updateReady};');
vm.runInContext(source,context);
const api=window.testApi;
const target=api.TARGETS.HUMMINGBIRD_200RS;
assert.equal(target.usbFilter.vendorId,0x2e3c);assert.equal(target.usbFilter.productId,0xdf11);
assert.equal(target.transferSize,2048);
api.ui.target.value='HUMMINGBIRD_200RS';
api.state.file={name:'FlightCode-HUMMINGBIRD_200RS.hex'};
const vector=Uint8Array.from([0x00,0xfc,0x01,0x20,0x01,0x01,0x00,0x08]);
api.state.image={format:'hex',start:0x08000000,end:0x08000008,segments:[{address:0x08000000,data:vector}]};
assert.equal(api.validateImage().ok,true);
let pages=api.sectorsForImage(target,api.state.image);
assert.equal(pages.length,1);assert.equal(pages[0].address,0x08000000);assert.equal(pages[0].size,2048);
// Last firmware byte occupies the preceding page, never the settings page.
api.state.image.segments.push({address:0x080ff7ff,data:Uint8Array.of(1)});
api.state.image.end=0x080ff800;
assert.equal(api.validateImage().ok,true);
pages=api.sectorsForImage(target,api.state.image);
assert.equal(pages.length,2);assert.equal(pages[1].address,0x080ff000);
assert.ok(pages.every(p=>p.address+p.size<=0x080ff800));
api.state.image.segments.push({address:0x080ff800,data:Uint8Array.of(1)});
api.state.image.end=0x080ff801;
assert.equal(api.validateImage().ok,false);
api.state.image.segments.pop();api.state.image.end=0x080ff800;
api.state.file.name='FlightCode-MAMBAF411.hex';assert.equal(api.validateImage().ok,false);
api.state.file.name='FlightCode-HUMMINGBIRD_200RS.hex';api.state.detectedBoard='SEQUREH7V2';assert.equal(api.validateImage().ok,false);
api.state.detectedBoard='';vector[4]=0;assert.equal(api.validateImage().ok,false);vector[4]=1;
// Parse and validate the compiled firmware, if supplied, through the same UI path.
if(process.argv[2]){
  api.state.image=window.FlightCodeIntelHex.parse(fs.readFileSync(process.argv[2],'utf8'));
  assert.equal(api.validateImage().ok,true);
  assert.ok(api.sectorsForImage(target,api.state.image).every(p=>p.address+p.size<=0x080ff800));
}
console.log('AT32 firmware target, vector validation and settings protection tests passed');
