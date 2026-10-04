const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("firmware-flasher.js", "utf8");
const targets = source.slice(source.indexOf("  const TARGETS="), source.indexOf("  const state="));
const validation = source.slice(source.indexOf("  function validateImage()"), source.indexOf("  function updateReady()"));
const context = vm.createContext({
  STM32_FLASH_START: 0x08000000, PICO_RESERVED_START: 0x103f0000,
  state: {}, ui: { target: { value: "" } },
  FlightCodeIntelHex: { readU32: (data, offset) => new DataView(data.buffer).getUint32(offset, true) },
  hex: value => `0x${value.toString(16)}`,
});
vm.runInContext(targets + `
  function selectedTarget(){return TARGETS[ui.target.value]}
  function targetForFilename(name){return Object.entries(TARGETS).find(([,target])=>name.includes(target.filename))}
  function expectedFilename(target){return 'FlightCode-'+target.filename+target.extension}
` + validation, context);
for (const [board, limit, flashSize] of [["FOXEERF722V4",0x08060000,512*1024],["FOXEERH743",0x081c0000,2048*1024]]) {
  context.ui.target.value = board;
  context.state.file = { name: `FlightCode-${board}.hex` };
  context.state.detectedBoard = board;
  const vector = new Uint8Array(8);
  new DataView(vector.buffer).setUint32(0,0x2003fc00,true);
  new DataView(vector.buffer).setUint32(4,0x08001001,true);
  context.state.image = { format:"hex", start:0x08000000, end:limit, segments:[{address:0x08000000,data:vector}] };
  assert.equal(vm.runInContext("validateImage().ok", context), true);
  context.state.image.end=limit+1;
  assert.equal(vm.runInContext("validateImage().ok", context), false);
  context.state.image.end=limit;
  context.state.image.segments.push({address:limit,data:new Uint8Array([1])});
  assert.equal(vm.runInContext("validateImage().ok", context), false);
  context.state.image.segments.pop();
  context.state.file.name=`FlightCode-${board==="FOXEERH743"?"FOXEERF722V4":"FOXEERH743"}.hex`;
  assert.equal(vm.runInContext("validateImage().ok", context), false);
  assert.equal(vm.runInContext("selectedTarget().sectors.reduce((sum,size)=>sum+size*1024,0)",context),flashSize);
  assert.match(fs.readFileSync("index.html","utf8"),new RegExp(`option value="${board}"`));
}
console.log("Foxeer flasher: targets, vector validation, reserved sectors and mismatched files passed");
