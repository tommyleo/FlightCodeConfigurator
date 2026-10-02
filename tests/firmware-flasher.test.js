const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("firmware-flasher.js", "utf8");
const context = vm.createContext({ console });
vm.runInContext(source, context);
const parse = vm.runInContext("FlightCodeIntelHex.parse", context);
const transferSizeFromConfiguration = vm.runInContext("FlightCodeDfu.transferSizeFromConfiguration", context);

assert.doesNotMatch(source, /\bconfirm\s*\(/);
assert.doesNotMatch(source, /navigator\.usb\.getDevices\(\)/);
assert.match(source, /navigator\.usb\.requestDevice\(\{filters:\[filter\]\}\)/);
assert.match(source, /resetAfterFlash\(\)/);
assert.match(source, /setAddress\(address\);await this\.out\(1,2,new Uint8Array\(\)\)/);
assert.match(source, /FLYWOOF405NANO:\{label:"Flywoo GN405 Nano V3"/);
assert.match(source, /FLYWOOF405NANO_ANALOG:\{label:"Flywoo GN405 Nano Analog"/);
assert.match(source, /SEQUREH7V2:\{label:"SEQURE H743 V2",filename:"SEQUREH7V2",kind:"stm32",extension:"\.hex",firmwareEnd:0x081c0000,transferSize:1024,sectors:\[(?:128,){15}128\]\}/);
assert.match(source, /STM32 FLIGHT CONTROLLERS AND RASPBERRY PI PICO ONLY/);
assert.match(source, /sort\(\(\[,a\],\[,b\]\)=>b\.filename\.length-a\.filename\.length\)/);
assert.match(source, /This firmware is for \$\{fileTarget\[1\]\.label\}/);
assert.match(source, /Expected \$\{expectedFilename\(target\)\}/);

const configurationDescriptor = Uint8Array.from([
  9, 2, 27, 0, 1, 1, 0, 0x80, 50,
  9, 4, 0, 0, 0, 0xfe, 1, 2, 4,
  9, 0x21, 0x0b, 0xff, 0x00, 0x00, 0x04, 0x1a, 0x01,
]);
assert.equal(transferSizeFromConfiguration(configurationDescriptor, 0, 0), 1024);
assert.equal(transferSizeFromConfiguration(configurationDescriptor, 1, 0), 0);

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
