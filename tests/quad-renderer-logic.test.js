const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("quad-renderer-logic.js", "utf8"), context);
const quad = vm.runInContext("FlightCodeQuadMath", context);

const radians = degrees => degrees * Math.PI / 180;
const axisQuaternion = (axis, degrees) => {
  const half = radians(degrees) / 2;
  const vector = axis === "roll" ? [1,0,0] : axis === "pitch" ? [0,1,0] : [0,0,1];
  return [Math.cos(half), ...vector.map(value => value * Math.sin(half))];
};
const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not close to ${expected}`);

const nosePitch = quad.rotateSceneVector([0,1,0], axisQuaternion("pitch", 30));
close(nosePitch[1], Math.cos(radians(30)));
close(nosePitch[2], Math.sin(radians(30)));
assert.ok(nosePitch[2] > 0, "positive pitch must lift the nose");

const rightRoll = quad.rotateSceneVector([1,0,0], axisQuaternion("roll", 30));
close(rightRoll[0], Math.cos(radians(30)));
close(rightRoll[2], -Math.sin(radians(30)));
assert.ok(rightRoll[2] < 0, "positive roll must lower the right side");

const noseYaw = quad.rotateSceneVector([0,1,0], axisQuaternion("yaw", 30));
close(noseYaw[0], Math.sin(radians(30)));
close(noseYaw[1], Math.cos(radians(30)));
assert.ok(noseYaw[0] > 0, "positive yaw must turn the nose right");

const unchanged = quad.rotateSceneVector([.25,-.5,.75], [0,0,0,0]);
unchanged.forEach((value,index)=>close(value,[.25,-.5,.75][index]));

console.log("Configurator quaternion renderer tests passed");
