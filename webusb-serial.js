const FlightCodeWebUsbSerial=(()=>{
  const DEVICE_FILTERS=[{vendorId:0x0483,productId:0x5740}];

  function isAndroid(userAgent=globalThis.navigator?.userAgent||""){
    return /Android/i.test(userAgent);
  }

  function findCdcInterfaces(device){
    const interfaces=device.configuration?.interfaces||[];
    let control=null,data=null;
    for(const iface of interfaces){
      for(const alternate of iface.alternates||[]){
        const candidate={number:iface.interfaceNumber,alternate:alternate.alternateSetting||0,endpoints:alternate.endpoints||[]};
        if(alternate.interfaceClass===0x02&&alternate.interfaceSubclass===0x02)control=candidate;
        if(alternate.interfaceClass===0x0a)data=candidate;
      }
    }
    if(!control||!data)throw new Error("The selected USB device has no CDC serial interface");
    const input=data.endpoints.find(endpoint=>endpoint.direction==="in"&&endpoint.type==="bulk");
    const output=data.endpoints.find(endpoint=>endpoint.direction==="out"&&endpoint.type==="bulk");
    if(!input||!output)throw new Error("The selected USB device has no CDC data endpoints");
    return {control,data,inputEndpoint:input.endpointNumber,outputEndpoint:output.endpointNumber};
  }

  function lineCoding(baudRate){
    const bytes=new Uint8Array(7);
    new DataView(bytes.buffer).setUint32(0,baudRate,true);
    bytes[4]=0;bytes[5]=0;bytes[6]=8;
    return bytes;
  }

  class Port{
    constructor(device){this.device=device;this.readable=null;this.writable=null;this.interfaces=null;this.closed=false;this.reading=false}
    getInfo(){return {usbVendorId:this.device.vendorId,usbProductId:this.device.productId}}
    async open(options={}){
      if(!this.device.opened)await this.device.open();
      if(!this.device.configuration)await this.device.selectConfiguration(1);
      this.interfaces=findCdcInterfaces(this.device);
      await this.device.claimInterface(this.interfaces.control.number);
      if(this.interfaces.data.number!==this.interfaces.control.number)await this.device.claimInterface(this.interfaces.data.number);
      if(this.interfaces.control.alternate)await this.device.selectAlternateInterface(this.interfaces.control.number,this.interfaces.control.alternate);
      if(this.interfaces.data.alternate)await this.device.selectAlternateInterface(this.interfaces.data.number,this.interfaces.data.alternate);
      const setup={requestType:"class",recipient:"interface",request:0x20,value:0,index:this.interfaces.control.number};
      const configured=await this.device.controlTransferOut(setup,lineCoding(options.baudRate||115200));
      if(configured.status!=="ok")throw new Error(`Could not configure USB serial line: ${configured.status}`);
      const enabled=await this.device.controlTransferOut({...setup,request:0x22,value:1});
      if(enabled.status!=="ok")throw new Error(`Could not enable USB serial line: ${enabled.status}`);
      this.closed=false;
      this.readable=new ReadableStream({
        pull:controller=>this.readChunk(controller),
        cancel:()=>this.closeDevice()
      });
      this.writable=new WritableStream({write:data=>this.writeChunk(data)});
    }
    async readChunk(controller){
      if(this.closed||this.reading)return;
      this.reading=true;
      try{
        const result=await this.device.transferIn(this.interfaces.inputEndpoint,256);
        if(result.status!=="ok")throw new Error(`USB read failed: ${result.status}`);
        if(result.data?.byteLength)controller.enqueue(new Uint8Array(result.data.buffer,result.data.byteOffset,result.data.byteLength));
      }catch(error){if(!this.closed)controller.error(error)}
      finally{this.reading=false}
    }
    async writeChunk(data){
      if(this.closed)throw new Error("USB serial connection is closed");
      const result=await this.device.transferOut(this.interfaces.outputEndpoint,data);
      if(result.status!=="ok")throw new Error(`USB write failed: ${result.status}`);
      if(result.bytesWritten!==undefined&&result.bytesWritten!==data.byteLength)throw new Error(`USB write incomplete: ${result.bytesWritten} of ${data.byteLength} bytes`);
    }
    async closeDevice(){
      if(this.closed)return;this.closed=true;
      try{if(this.device.opened)await this.device.close()}catch{}
    }
    async close(){await this.closeDevice();this.readable=null;this.writable=null}
  }

  async function authorizedPorts(usb=globalThis.navigator?.usb){
    if(!usb)return [];
    const devices=await usb.getDevices();
    return devices.filter(device=>DEVICE_FILTERS.some(filter=>device.vendorId===filter.vendorId&&device.productId===filter.productId)).map(device=>new Port(device));
  }

  async function requestPort(usb=globalThis.navigator?.usb){
    if(!usb)throw new Error("WebUSB is not available");
    return new Port(await usb.requestDevice({filters:DEVICE_FILTERS}));
  }

  return {DEVICE_FILTERS,Port,authorizedPorts,requestPort,isAndroid,findCdcInterfaces,lineCoding};
})();
if(typeof window!=="undefined")window.FlightCodeWebUsbSerial=FlightCodeWebUsbSerial;
if(typeof module!=="undefined")module.exports=FlightCodeWebUsbSerial;
