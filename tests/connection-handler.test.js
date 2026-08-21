const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("app.js", "utf8");
const connect = source.match(
  /async function connect\(\)\{([\s\S]*?)\r?\n\}\r?\nasync function settleWithin/
);

assert.ok(connect, "connect() must remain discoverable");
assert.doesNotMatch(connect[1], /\bp\s*\[/,
  "connect() must not read tokens from the serial message parser");
assert.match(source, /if\(p\[1\]==="GYRO_RATE"\)/,
  "gyro rate messages must be handled by the serial parser");

console.log("Configurator connection handler tests passed");
