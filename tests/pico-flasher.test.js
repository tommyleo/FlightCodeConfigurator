const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("pico-flasher.js", "utf8"), context);
const parse = vm.runInContext("FlightCodeUf2.parse", context);
const commandPacket = vm.runInContext("FlightCodePicoboot.commandPacket", context);
const PicobootSession = vm.runInContext("Rp2350PicobootSession", context);

const MAGIC_START0 = 0x0a324655;
const MAGIC_START1 = 0x9e5d5157;
const MAGIC_END = 0x0ab16f30;
const FAMILY_PRESENT = 0x00002000;
const EXTENSIONS_PRESENT = 0x00008000;
const ABSOLUTE_FAMILY = 0xe48bff57;
const RP2350_ARM_S_FAMILY = 0xe48bff59;
const IGNORE_BLOCK = 0x9957e304;

function block({ address, number, count, family = RP2350_ARM_S_FAMILY, flags = FAMILY_PRESENT, fill = 0x5a, ignored = false }) {
  const bytes = new Uint8Array(512);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC_START0, true);
  view.setUint32(4, MAGIC_START1, true);
  view.setUint32(8, flags, true);
  view.setUint32(12, address, true);
  view.setUint32(16, 256, true);
  view.setUint32(20, number, true);
  view.setUint32(24, count, true);
  view.setUint32(28, family, true);
  bytes.fill(fill, 32, 288);
  if (ignored) view.setUint32(288, IGNORE_BLOCK, true);
  view.setUint32(508, MAGIC_END, true);
  return bytes;
}

function join(...blocks) {
  const bytes = new Uint8Array(blocks.length * 512);
  blocks.forEach((item, index) => bytes.set(item, index * 512));
  return bytes;
}

const auxiliary = block({
  address: 0x10ffff00,
  number: 0,
  count: 2,
  family: ABSOLUTE_FAMILY,
  flags: FAMILY_PRESENT | EXTENSIONS_PRESENT,
  fill: 0xef,
  ignored: true,
});
const main0 = block({ address: 0x10000000, number: 0, count: 2, fill: 0x11 });
const main1 = block({ address: 0x10000100, number: 1, count: 2, fill: 0x22 });
const image = parse(join(auxiliary, main0, main1));

assert.equal(image.format, "uf2");
assert.equal(image.start, 0x10000000);
assert.equal(image.end, 0x10000200);
assert.equal(image.totalBytes, 512);
assert.equal(image.familyId, RP2350_ARM_S_FAMILY);
assert.equal(image.auxiliaryBlocks, 1);
assert.equal(image.segments.length, 1);
assert.equal(image.segments[0].data[0], 0x11);
assert.equal(image.segments[0].data[256], 0x22);

const corrupted = join(main0, main1);
corrupted[0] = 0;
assert.throws(() => parse(corrupted), /magic/i);

assert.throws(() => parse(main0), /incomplete/i);

const wrongFamily = block({ address: 0x10000000, number: 0, count: 1, family: 0xe48bff56 });
assert.throws(() => parse(wrongFamily), /unsupported family/i);

const overlapping = join(
  block({ address: 0x10000000, number: 0, count: 2 }),
  block({ address: 0x10000000, number: 1, count: 2 }),
);
assert.throws(() => parse(overlapping), /overlapping/i);

const args = new Uint8Array(8);
new DataView(args.buffer).setUint32(0, 0x10000000, true);
const packet = commandPacket(7, 0x05, args, 4096);
const packetView = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
assert.equal(packet.byteLength, 32);
assert.equal(packetView.getUint32(0, true), 0x431fd10b);
assert.equal(packetView.getUint32(4, true), 7);
assert.equal(packet[8], 0x05);
assert.equal(packet[9], 8);
assert.equal(packetView.getUint32(12, true), 4096);
assert.equal(packetView.getUint32(16, true), 0x10000000);

(async () => {
  const commandIds = [];
  let currentCommand = 0;
  const emptyData = () => new DataView(new ArrayBuffer(0));
  const fakeDevice = {
    opened: false,
    configuration: null,
    async open() { this.opened = true; },
    async selectConfiguration() {
      this.configuration = {
        interfaces: [{
          interfaceNumber: 1,
          alternates: [{
            alternateSetting: 0,
            interfaceClass: 0xff,
            endpoints: [
              { direction: "out", type: "bulk", endpointNumber: 1 },
              { direction: "in", type: "bulk", endpointNumber: 2 },
            ],
          }],
        }],
      };
    },
    async claimInterface(number) { assert.equal(number, 1); },
    async selectAlternateInterface(number, alternate) { assert.equal(number, 1); assert.equal(alternate, 0); },
    async controlTransferOut(setup) { assert.equal(setup.request, 0x41); return { status: "ok", bytesWritten: 0 }; },
    async controlTransferIn() { return { status: "ok", data: new DataView(new ArrayBuffer(16)) }; },
    async transferOut(endpoint, data) {
      assert.equal(endpoint, 1);
      if (data.byteLength === 32) { currentCommand = data[8]; commandIds.push(currentCommand); }
      return { status: "ok", bytesWritten: data.byteLength };
    },
    async transferIn(endpoint, length) {
      assert.equal(endpoint, 2);
      if (currentCommand === 0x84 && length > 1) {
        const data = new Uint8Array(length);
        data.fill(0xa5);
        return { status: "ok", data: new DataView(data.buffer) };
      }
      return { status: "ok", data: emptyData() };
    },
    async releaseInterface(number) { assert.equal(number, 1); },
    async close() { this.opened = false; },
  };

  const session = new PicobootSession(fakeDevice);
  await session.open();
  await session.prepare();
  await session.erase(0x10000000, 4096);
  await session.write(0x10000000, new Uint8Array(256));
  const readBack = await session.read(0x10000000, 256);
  assert.equal(readBack.byteLength, 256);
  assert.equal(readBack[0], 0xa5);
  assert.deepEqual(commandIds, [0x01, 0x06, 0x03, 0x05, 0x84]);
  await session.close();
  assert.equal(commandIds.at(-1), 0x01);

  console.log("Pico UF2 and Picoboot tests passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
