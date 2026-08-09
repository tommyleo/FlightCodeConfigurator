const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("firmware-flasher.js", "utf8");
const context = vm.createContext({ console });
vm.runInContext(source, context);
const parse = vm.runInContext("FlightCodeIntelHex.parse", context);

assert.doesNotMatch(source, /\bconfirm\s*\(/);
assert.doesNotMatch(source, /navigator\.usb\.getDevices\(\)/);
assert.match(source, /navigator\.usb\.requestDevice\(\{filters:\[filter\]\}\)/);
assert.match(source, /resetAfterFlash\(\)/);

function record(address, type, data) {
  const bytes = [data.length, address >> 8, address & 0xff, type, ...data];
  const checksum = (-bytes.reduce((sum, value) => sum + value, 0)) & 0xff;
  return `:${[...bytes, checksum].map(value => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

const vector = [
  0x00, 0xfc, 0x01, 0x20, // Initial stack: 0x2001FC00
  0x21, 0x74, 0x00, 0x08, // Reset vector: 0x08007421
  0x46, 0x43, 0x00, 0x00,
];
const validHex = [
  record(0, 4, [0x08, 0x00]),
  record(0, 0, vector),
  record(vector.length, 0, [1, 2, 3, 4]),
  record(0, 1, []),
].join("\n");

const image = parse(validHex);
assert.equal(image.start, 0x08000000);
assert.equal(image.end, 0x08000010);
assert.equal(image.totalBytes, 16);
assert.equal(image.segments.length, 1);
assert.equal(image.readU32(image.segments[0].data, 0), 0x2001fc00);
assert.equal(image.readU32(image.segments[0].data, 4), 0x08007421);

const corrupted = validHex.replace(/.$/, value => value === "0" ? "1" : "0");
assert.throws(() => parse(corrupted), /checksum/i);

const overlapHex = [
  record(0, 4, [0x08, 0x00]),
  record(0, 0, vector),
  record(4, 0, [1, 2, 3, 4]),
  record(0, 1, []),
].join("\n");
assert.throws(() => parse(overlapHex), /overlapping/i);

const invalidEofHex = [
  record(0, 4, [0x08, 0x00]),
  record(0, 0, vector),
  record(0, 1, [0x00]),
].join("\n");
assert.throws(() => parse(invalidEofHex), /invalid EOF/i);

const overflowingAddressHex = [
  record(0, 4, [0xff, 0xff]),
  record(0xffff, 0, [1, 2]),
  record(0, 1, []),
].join("\n");
assert.throws(() => parse(overflowingAddressHex), /32-bit range/i);

console.log("Firmware flasher parser tests passed");
