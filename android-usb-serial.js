const FlightCodeAndroidUsbSerial=(()=>{
  const bridge=globalThis.AndroidUsb;
  const listeners={connected:new Set(),data:new Set(),error:new Set(),disconnected:new Set()};
  const emit=(name,value)=>listeners[name].forEach(callback=>callback(value));
  const once=name=>new Promise((resolve,reject)=>{
    const connected=value=>{cleanup();resolve(value)};
    const failed=value=>{cleanup();reject(new Error(value||"USB connection failed"))};
    const cleanup=()=>{listeners[name].delete(connected);listeners.error.delete(failed)};
    listeners[name].add(connected);listeners.error.add(failed);
  });

  class Port{
    constructor(){this.readable=null;this.writable=null;this.closed=true;this.controller=null;this.onData=null;this.onDisconnect=null}
    getInfo(){return {usbVendorId:Number(bridge?.vendorId?.()||0),usbProductId:Number(bridge?.productId?.()||0)}}
    async open(options={}){
      if(!bridge)throw new Error("Android USB bridge is unavailable");
      this.closed=false;
      this.readable=new ReadableStream({
        start:controller=>{
          this.controller=controller;
          this.onData=base64=>controller.enqueue(Uint8Array.from(atob(base64),character=>character.charCodeAt(0)));
          this.onDisconnect=()=>{if(!this.closed)controller.error(new Error("USB device disconnected"))};
          listeners.data.add(this.onData);listeners.disconnected.add(this.onDisconnect);
        },
        cancel:()=>this.close()
      });
      this.writable=new WritableStream({write:data=>{
        let binary="";for(const byte of new Uint8Array(data))binary+=String.fromCharCode(byte);
        if(!bridge.write(btoa(binary)))throw new Error("USB write failed");
      }});
      const ready=once("connected");bridge.connect(options.baudRate||115200);await ready;
    }
    async close(){
      if(this.closed)return;this.closed=true;
      listeners.data.delete(this.onData);listeners.disconnected.delete(this.onDisconnect);
      bridge.disconnect();this.readable=null;this.writable=null;
    }
  }

  const api={
    available:()=>Boolean(bridge),
    requestPort:async()=>new Port(),
    _connected:()=>emit("connected"),
    _data:value=>emit("data",value),
    _error:value=>emit("error",value),
    _disconnected:()=>emit("disconnected")
  };
  globalThis.FlightCodeAndroidUsb=api;
  return api;
})();
