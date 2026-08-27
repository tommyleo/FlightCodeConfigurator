const assert=require("node:assert/strict");
const fs=require("node:fs");
const source=fs.readFileSync(require("node:path").join(__dirname,"..","android-usb-serial.js"),"utf8");
assert.match(source,/globalThis\.AndroidUsb/);
assert.match(source,/new ReadableStream/);
assert.match(source,/new WritableStream/);
assert.match(source,/bridge\.connect\(options\.baudRate\|\|115200\)/);
assert.match(source,/USB device disconnected/);
console.log("Android native USB adapter tests passed");
