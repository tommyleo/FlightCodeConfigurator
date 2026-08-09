const assert=require("assert");
const logic=require("../serial-port-logic.js");

const port=(name,usbVendorId,usbProductId)=>({name,getInfo:()=>({usbVendorId,usbProductId})});

{
  const raspberry=port("raspberry",0x2e8a,0x0009);
  const firstFlightCode=port("flightcode-1",0x0483,0x5740);
  const secondFlightCode=port("flightcode-2",0x0483,0x5740);
  assert.deepStrictEqual(
    logic.preferredPorts([raspberry,firstFlightCode,secondFlightCode]).map(item=>item.name),
    ["flightcode-1","flightcode-2","raspberry"]
  );
}

{
  const rp2040=port("rp2040",0x2e8a,0x000a);
  const unrelated=port("unrelated",0x1234,0x5678);
  const unavailable={name:"unavailable",getInfo(){throw new Error("gone")}};
  assert.deepStrictEqual(logic.preferredPorts([unrelated,unavailable,rp2040]).map(item=>item.name),["rp2040"]);
  assert.deepStrictEqual(logic.preferredPorts([]),[]);
}

console.log("serial-port-logic tests passed");
