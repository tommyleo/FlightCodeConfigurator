const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("blackbox-logic.js", "utf8"), context);
const blackbox = vm.runInContext("FlightCodeBlackboxLogic", context);

assert.equal(blackbox.stopReasonName(2), "DISARM");
assert.equal(blackbox.stopReasonName(4 | 32), "SBUS_TIMEOUT");
assert.equal(blackbox.stopReasonName(8), "IMU_FAILURE");

const encoded=[100,-200,300,40,50,60,0,128,255,64,70,3,63,125,1480,370,4,2,4,6,-2,-4,-6,8,10,12,14,-16,18];
const record=blackbox.decodeRecord(encoded,400,200);
assert.equal(record.t,2);
assert.deepEqual(record.gyro,[10,-20,30]);
assert.equal(record.throttle,35);
assert.equal(record.mixerSaturated,true);
assert.equal(record.stopReason,"DISARM");
assert.equal(record.mainLoopUs,63);
assert.equal(record.mainLoopHz,15873.02);
assert.equal(record.gyroLoopUs,125);
assert.equal(record.gyroLoopHz,8000);
assert.equal(record.batteryVoltage,14.8);
assert.deepEqual(record.dTerm,[4,5,6]);
assert.deepEqual(record.ffTerm,[7,-8,9]);
assert.deepEqual(record.pid,[11,-3,15]);

const clipped=[...encoded];clipped.splice(17,3,80,-80,80);
const clippedRecord=blackbox.decodeRecord(clipped,0,200);
assert.deepEqual(clippedRecord.pid,[35,-35,25]);

assert.equal(blackbox.decodeRecord(encoded.slice(0,28),400,200),null);

const extended=[...encoded,1234567,110,-220,330,125,-250,375,100,-200,300,7,20,-40,50];
const extendedRecord=blackbox.decodeRecord(extended,1,1000);
assert.equal(extendedRecord.t,0.001);
assert.equal(extendedRecord.timestampUs,1234567);
assert.deepEqual(extendedRecord.gyroRaw,[11,-22,33]);
assert.deepEqual(extendedRecord.dTermUnfiltered,[1.25,-2.5,3.75]);
assert.deepEqual(extendedRecord.dTermFiltered,[1,-2,3]);
assert.deepEqual(extendedRecord.dTerm,[1,-2,3]);
assert.equal(extendedRecord.droppedRecords,7);
assert.deepEqual(extendedRecord.pid,[10,-20,25]);

const binary=new Uint8Array(48),binaryView=new DataView(binary.buffer);
binaryView.setUint32(0,1234567,true);
[110,-220,330,100,-200,300,40,50,60,125,-250,375,100,-200,300].forEach((value,i)=>binaryView.setInt16(4+i*2,value,true));
[0,128,255,64,70,3].forEach((value,i)=>binaryView.setUint8(34+i,value));
[20,-40,50].forEach((value,i)=>binaryView.setInt8(40+i,value));
binaryView.setUint16(43,1480,true);binaryView.setUint16(45,7,true);binaryView.setUint8(47,2);
const binaryRecord=blackbox.decodeBinaryRecord(binary,1,1000,4);
assert.equal(binaryRecord.t,0.001);
assert.equal(binaryRecord.timestampUs,1234567);
assert.deepEqual(Array.from(binaryRecord.gyroRaw),[11,-22,33]);
assert.deepEqual(Array.from(binaryRecord.gyro),[10,-20,30]);
assert.deepEqual(Array.from(binaryRecord.setpoint),[4,5,6]);
assert.deepEqual(Array.from(binaryRecord.dTermUnfiltered),[1.25,-2.5,3.75]);
assert.deepEqual(Array.from(binaryRecord.dTerm),[1,-2,3]);
assert.deepEqual(Array.from(binaryRecord.pid),[10,-20,25]);
assert.equal(binaryRecord.batteryVoltage,14.8);
assert.equal(binaryRecord.cellVoltage,3.7);
assert.equal(binaryRecord.droppedRecords,7);
assert.equal(blackbox.decodeBinaryRecord(new Uint8Array(47),0),null);

const missing=[];
blackbox.addMissingSector(missing,17840,10,44631);
blackbox.addMissingSector(missing,17850,10,44632);
blackbox.addMissingSector(missing,18000,10,44647);
assert.equal(missing.length,2);
assert.equal(missing[0].start,17840);
assert.equal(missing[0].count,20);
assert.equal(missing[0].sector,44631);
assert.equal(missing[0].lastSector,44632);
assert.equal(blackbox.missingSectorCount(missing),3);

console.log("Configurator Blackbox logic tests passed");

// Historical metadata must never inherit current UI settings or report off
// when the value was never recorded.
const tuning=[480,480,460,.2,0,0,0,.2,50,92,52,0,0,90,5.5,12.5];
for(const value of [0,10,100,300,1000]){
  const m=blackbox.buildMetadata({version:3},[...tuning,value],[.155,.2,.0019]);
  assert.equal(m.throttleRiseMs,value);
  assert.equal(m.filters.dynamicD,12.5);
  assert.equal(JSON.parse(JSON.stringify({flightConfiguration:m})).flightConfiguration.throttleRiseMs,value);
}
for(const version of [2,3]){
  for(const value of [undefined,-1,NaN,Infinity,1001]){
    assert.equal(blackbox.buildMetadata({version},[...tuning,value],[]).throttleRiseMs,null);
  }
}
assert.equal(blackbox.buildMetadata({version:2},[...tuning,0],[]).throttleRiseMs,null);
assert.equal(blackbox.buildMetadata(null,tuning,[]),null);
assert.equal(fs.readFileSync("blackbox-logic.js","utf8"),fs.readFileSync("android/app/src/main/assets/configurator/blackbox-logic.js","utf8"));
