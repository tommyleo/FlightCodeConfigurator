const assert=require("assert");
const usbSerial=require("../webusb-serial.js");

assert.equal(usbSerial.isAndroid("Mozilla/5.0 (Linux; Android 16) Chrome/151"),true);
assert.equal(usbSerial.isAndroid("Mozilla/5.0 (Windows NT 10.0) Chrome/151"),false);
assert.deepEqual([...usbSerial.lineCoding(115200)],[0x00,0xc2,0x01,0x00,0,0,8]);

const interfaces=[
  {interfaceNumber:0,alternates:[{alternateSetting:0,interfaceClass:2,interfaceSubclass:2,endpoints:[{direction:"in",type:"interrupt",endpointNumber:2}]}]},
  {interfaceNumber:1,alternates:[{alternateSetting:0,interfaceClass:10,interfaceSubclass:0,endpoints:[{direction:"out",type:"bulk",endpointNumber:1},{direction:"in",type:"bulk",endpointNumber:1}]}]}
];
assert.deepEqual(usbSerial.findCdcInterfaces({configuration:{interfaces}}),{
  control:{number:0,alternate:0,endpoints:interfaces[0].alternates[0].endpoints},
  data:{number:1,alternate:0,endpoints:interfaces[1].alternates[0].endpoints},
  inputEndpoint:1,outputEndpoint:1
});
assert.throws(()=>usbSerial.findCdcInterfaces({configuration:{interfaces:[]}}),/no CDC serial interface/);

console.log("WebUSB CDC serial tests passed");
