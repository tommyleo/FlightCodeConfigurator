const FlightCodeSerialPortLogic=(()=>{
  const flightCodeIds=[{usbVendorId:0x0483,usbProductId:0x5740}];
  const raspberryIds=[
    {usbVendorId:0x2e8a,usbProductId:0x0009},
    {usbVendorId:0x2e8a,usbProductId:0x000a}
  ];
  const matches=(info,ids)=>ids.some(id=>info.usbVendorId===id.usbVendorId&&info.usbProductId===id.usbProductId);
  function preferredPorts(ports){
    const flightCode=[],raspberry=[];
    for(const port of ports||[]){
      let info={};
      try{info=port.getInfo?.()||{}}catch{}
      if(matches(info,flightCodeIds))flightCode.push(port);
      else if(matches(info,raspberryIds))raspberry.push(port);
    }
    return [...flightCode,...raspberry];
  }
  return{preferredPorts};
})();
if(typeof window!=="undefined")window.FlightCodeSerialPortLogic=FlightCodeSerialPortLogic;
if(typeof module!=="undefined")module.exports=FlightCodeSerialPortLogic;
