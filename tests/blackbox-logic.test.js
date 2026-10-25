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
assert.equal(blackbox.decodeRecord(encoded,400,200),null);
assert.equal(blackbox.decodeRecord(encoded.slice(0,28),400,200),null);

const extended=[...encoded,1234567,110,-220,330,125,-250,375,100,-200,300,7,20,-40,50];
const extendedRecord=blackbox.decodeRecord(extended,1,1000);
assert.equal(extendedRecord.t,null);
assert.equal(extendedRecord.timestampUs,1234567);
assert.deepEqual(extendedRecord.gyroRaw,[11,-22,33]);
assert.deepEqual(extendedRecord.dTermUnfiltered,[1.25,-2.5,3.75]);
assert.deepEqual(extendedRecord.dTermFiltered,[1,-2,3]);
assert.deepEqual(extendedRecord.dTerm,[1,-2,3]);
assert.equal(extendedRecord.overwrittenRecords,7);
assert.deepEqual(extendedRecord.pid,[10,-20,25]);

const binary=new Uint8Array(60),binaryView=new DataView(binary.buffer);
binaryView.setUint32(0,1234567,true);
[110,-220,330,100,-200,300,40,50,60,125,-250,375,100,-200,300].forEach((value,i)=>binaryView.setInt16(4+i*2,value,true));
[0,128,255,64,70,3].forEach((value,i)=>binaryView.setUint8(34+i,value));
[20,-40,50].forEach((value,i)=>binaryView.setInt8(40+i,value));
[20,-10,6,-4,8,-12,2,-6,10].forEach((value,i)=>binaryView.setInt8(43+i,value));
binaryView.setUint16(52,1480,true);binaryView.setUint16(54,7,true);
const packedTiming=63|(125<<12);
binaryView.setUint8(56,packedTiming);binaryView.setUint8(57,packedTiming>>8);
binaryView.setUint8(58,packedTiming>>16);binaryView.setUint8(59,0x20);
const binaryRecord=blackbox.decodeBinaryRecord(binary,1,1000,4);
assert.equal(binaryRecord.t,null);
assert.equal(binaryRecord.timestampUs,1234567);
assert.deepEqual(Array.from(binaryRecord.gyroRaw),[11,-22,33]);
assert.deepEqual(Array.from(binaryRecord.gyro),[10,-20,30]);
assert.deepEqual(Array.from(binaryRecord.setpoint),[4,5,6]);
assert.deepEqual(Array.from(binaryRecord.dTermUnfiltered),[1.25,-2.5,3.75]);
assert.deepEqual(Array.from(binaryRecord.dTerm),[1,-2,3]);
assert.deepEqual(Array.from(binaryRecord.pid),[10,-20,25]);
assert.deepEqual(Array.from(binaryRecord.pTerm),[10,-5,3]);
assert.deepEqual(Array.from(binaryRecord.iTerm),[-2,4,-6]);
assert.deepEqual(Array.from(binaryRecord.ffTerm),[1,-3,5]);
assert.equal(binaryRecord.batteryVoltage,14.8);
assert.equal(binaryRecord.cellVoltage,3.7);
assert.equal(binaryRecord.droppedRecords,7);
assert.equal(binaryRecord.mainLoopUs,63);
assert.equal(binaryRecord.mainLoopHz,15873.02);
assert.equal(binaryRecord.gyroLoopUs,125);
assert.equal(binaryRecord.gyroLoopHz,8000);
assert.equal(binaryRecord.logFormatVersion,"2.0");
binaryView.setUint8(59,0x10);
assert.equal(blackbox.decodeBinaryRecord(binary,1,1000,4),null);
const timed=[{timestampUs:0xfffffff0},{timestampUs:1984},{timestampUs:7984}];
assert.equal(blackbox.applyTimestamps(timed),0.008);
assert.deepEqual(timed.map(r=>r.t),[0,0.002,0.008]);
assert.throws(()=>blackbox.applyTimestamps([{timestampUs:null}]));
assert.equal(blackbox.applyTimestamps([]),0);
const bad=[...extended];bad[30]=NaN;
assert.equal(blackbox.decodeRecord(bad,0),null);
assert.equal(blackbox.decodeBinaryRecord(new Uint8Array(59),0),null);

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

const tuning=[480,480,460,.2,0,0,0,.2,50,92,52,0,0,90,5.5,12.5];
const metadata=blackbox.buildMetadata({version:6,logFormatVersion:"2.0"},tuning,[155,200,190,110,200,105,150,260,0]);
assert.equal(metadata.version,6);
assert.equal(blackbox.buildMetadata({version:5},tuning,[1,2,3]),null);
assert.equal(metadata.filters.dynamicD,12.5);
assert.equal(metadata.motorIdlePercent,5.5);
assert.equal(blackbox.buildMetadata(null,tuning,[]),null);
assert.equal(fs.readFileSync("blackbox-logic.js","utf8"),fs.readFileSync("android/app/src/main/assets/configurator/blackbox-logic.js","utf8"));
