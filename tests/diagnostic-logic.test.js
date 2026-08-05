const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("diagnostic-logic.js", "utf8"), context);
const logic = vm.runInContext("FlightCodeDiagnosticLogic", context);

assert.deepEqual({ ...logic.receiverChannelIndex("TAER1234") }, { throttle: 0, roll: 1, pitch: 2, yaw: 3 });
assert.deepEqual({ ...logic.receiverChannelIndex("AETR1234") }, { roll: 0, pitch: 1, throttle: 2, yaw: 3 });

const mix = (roll, pitch, yaw, throttle = 50) => [
  throttle - roll - pitch - yaw,
  throttle - roll + pitch + yaw,
  throttle + roll - pitch + yaw,
  throttle + roll + pitch - yaw,
];
assert.deepEqual(Array.from(logic.motorProjection, project => project(mix(12, -7, 4))), [12, -7, 4]);

let timestampUs = 0;
function imuStage(stage, axis, gyro, accel) {
  return Array.from({ length: 101 }, () => ({
    stage, axis, timestampUs: timestampUs += 10000,
    gyro: [...gyro], accel: [...accel], quaternion: [1, 0, 0, 0],
    attitude: { roll: 0, pitch: 0, yaw: 0 },
  }));
}
const validImu = [
  ...imuStage("plane_start", "still", [0, 0, 0], [0, 0, 1]),
  ...imuStage("roll_p90", "roll", [90, 2, 0], [0, 1, 0]),
  ...imuStage("roll_n90", "roll", [-90, -2, 0], [0, -1, 0]),
  ...imuStage("pitch_p90", "pitch", [1, 90, 1], [-1, 0, 0]),
  ...imuStage("pitch_n90", "pitch", [-1, -90, 0], [1, 0, 0]),
  ...imuStage("yaw_p90", "yaw", [1, 0, 90], [0, 0, 1]),
  ...imuStage("yaw_n90", "yaw", [0, 1, -90], [0, 0, 1]),
  ...imuStage("plane_end", "still", [0, 0, 0], [0, 0, 1]),
];
const validImuSummary = logic.imuSummary(validImu);
assert.equal(validImuSummary.ok, true);
assert.deepEqual({ ...validImuSummary.gyroAxisDirection }, { roll: true, pitch: true, yaw: true });
assert.deepEqual({ ...validImuSummary.gyroAxisIsolation }, { roll: true, pitch: true, yaw: true });

const swappedImu = validImu.map(sample => {
  const gyro = [...sample.gyro];
  if (sample.axis === "roll" || sample.axis === "pitch") [gyro[0], gyro[1]] = [gyro[1], gyro[0]];
  if (sample.axis === "yaw") gyro[2] = -gyro[2];
  return { ...sample, gyro };
});
const swappedImuSummary = logic.imuSummary(swappedImu);
assert.equal(swappedImuSummary.ok, false);
assert.equal(Object.values(swappedImuSummary.gyroAxisDirection).every(Boolean), false);

function pidSamples(direction = "NORMAL", wrongPitch = false) {
  const samples = [];
  const add = (stage, gyro, motors) => samples.push({ stage, gyro, motors });
  for (let i = 0; i < 80; ++i) add("stabile", [0, 0, 0], mix(0, 0, 0, 3));
  for (let i = 0; i < 80; ++i) add("throttle50", [0, 0, 0], mix(0, 0, 0, 50));
  for (let i = 0; i < 160; ++i) {
    const rate = Math.sin(i * Math.PI * 4 / 159) * 100;
    add("feedbackRoll", [rate, 0, 0], mix(-rate * .1, 0, 0));
    add("feedbackPitch", [0, rate, 0], mix(0, (wrongPitch ? 1 : -1) * rate * .1, 0));
    add("feedbackYaw", [0, 0, rate], mix(0, 0, (direction === "REVERSED" ? 1 : -1) * rate * .1));
  }
  for (let i = 0; i < 80; ++i) {
    add("commandRoll", [0, 0, 0], mix(10, 0, 0));
    add("commandPitch", [0, 0, 0], mix(0, wrongPitch ? 10 : -10, 0));
    add("commandYaw", [0, 0, 0], mix(0, 0, direction === "REVERSED" ? -10 : 10));
  }
  return samples;
}

const normalPid = logic.pidSummary(pidSamples("NORMAL"), "NORMAL", 8000, 142);
assert.equal(normalPid.ok, true);
assert.deepEqual({ ...normalPid.expectedOpposition }, { roll: true, pitch: true, yaw: true });
assert.deepEqual({ ...normalPid.commandResponse }, { throttle: true, roll: true, pitch: true, yaw: true });
assert.equal(normalPid.loopHz, 8000);

const reversedPid = logic.pidSummary(pidSamples("REVERSED"), "REVERSED", 8000, 142);
assert.equal(reversedPid.ok, true);
assert.equal(reversedPid.expectedOpposition.yaw, true);
assert.equal(reversedPid.commandResponse.yaw, true);

const wrongPitchPid = logic.pidSummary(pidSamples("NORMAL", true), "NORMAL", 8000, 142);
assert.equal(wrongPitchPid.ok, false);
assert.equal(wrongPitchPid.expectedOpposition.pitch, false);
assert.equal(wrongPitchPid.commandResponse.pitch, false);

console.log("Configurator diagnostic logic tests passed");
