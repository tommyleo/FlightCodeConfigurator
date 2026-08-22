const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("app.js", "utf8");
const connect = source.match(
  /async function connect\(\)\{([\s\S]*?)\r?\n\}\r?\nasync function settleWithin/
);
const connectWebUsb = source.match(
  /async function connectWebUsb\(\)\{([\s\S]*?)\r?\n\}\r?\nasync function connect\(\)/
);
const line = source.match(
  /function line\(value\)\{([\s\S]*?)\r?\n\}\r?\nasync function readLoop/
);

assert.ok(connect, "connect() must remain discoverable");
assert.ok(connectWebUsb, "connectWebUsb() must remain discoverable");
assert.ok(line, "line() must remain discoverable");
assert.doesNotMatch(connect[1], /\bp\s*\[/,
  "connect() must not read tokens from the serial message parser");
assert.doesNotMatch(connectWebUsb[1], /\bp\s*\[/,
  "connectWebUsb() must not read tokens from the serial message parser");
assert.match(source, /if\(p\[1\]==="GYRO_RATE"\)/,
  "gyro rate messages must be handled by the serial parser");
assert.match(line[1], /if\(p\[1\]==="VBAT_MULTIPLIER"\)/,
  "battery multiplier messages must be handled by the serial parser");

console.log("Configurator connection handler tests passed");
