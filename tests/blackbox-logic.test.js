const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("blackbox-logic.js", "utf8"), context);
const blackbox = vm.runInContext("FlightCodeBlackboxLogic", context);

assert.equal(blackbox.stopReasonName(2), "DISARM");
assert.equal(blackbox.stopReasonName(4 | 32), "SBUS_TIMEOUT");
assert.equal(blackbox.stopReasonName(8), "IMU_FAILURE");

const encoded=[100,-200,300,40,50,60,2,-4,6,0,128,255,64,70,3,125,1480,370,4,2,4,6,-2,-4,-6,8,10,12,14,-16,18];
const record=blackbox.decodeRecord(encoded,400,200);
assert.equal(record.t,2);
assert.deepEqual(record.gyro,[10,-20,30]);
assert.deepEqual(record.pid,[1,-2,3]);
assert.equal(record.throttle,35);
assert.equal(record.mixerSaturated,true);
assert.equal(record.stopReason,"DISARM");
assert.equal(record.batteryVoltage,14.8);
assert.deepEqual(record.dTerm,[4,5,6]);
assert.deepEqual(record.ffTerm,[7,-8,9]);

const legacy=blackbox.decodeRecord(encoded.slice(0,28),400,200);
assert.deepEqual(Array.from(legacy.ffTerm),[0,0,0]);

console.log("Configurator Blackbox logic tests passed");
