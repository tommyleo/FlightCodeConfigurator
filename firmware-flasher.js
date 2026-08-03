const FlightCodeIntelHex=(()=>{
  const readU32=(bytes,offset)=>
    (bytes[offset]|(bytes[offset+1]<<8)|(bytes[offset+2]<<16)|(bytes[offset+3]<<24))>>>0;

  function parse(text){
    const records=[];
    let base=0,eof=false,totalBytes=0;
    const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/);
    lines.forEach((raw,index)=>{
      const line=raw.trim();
      if(!line)return;
      if(eof)throw new Error(`HEX line ${index+1}: data found after EOF`);
      if(line[0]!==":"||line.length<11||(line.length-1)%2!==0)throw new Error(`HEX line ${index+1}: invalid record`);
      const bytes=[];
      for(let i=1;i<line.length;i+=2){const value=Number.parseInt(line.slice(i,i+2),16);if(!Number.isFinite(value))throw new Error(`HEX line ${index+1}: invalid hexadecimal value`);bytes.push(value)}
      const length=bytes[0],offset=(bytes[1]<<8)|bytes[2],type=bytes[3],payload=bytes.slice(4,-1);
      if(payload.length!==length)throw new Error(`HEX line ${index+1}: incorrect record length`);
      if((bytes.reduce((sum,value)=>sum+value,0)&0xff)!==0)throw new Error(`HEX line ${index+1}: checksum error`);
      if(type===0){
        const address=base+offset;
        if(address>0xffffffff||address+length>0x100000000)throw new Error(`HEX line ${index+1}: address exceeds 32-bit range`);
        records.push({address,data:Uint8Array.from(payload)});totalBytes+=length;
      }
      else if(type===1){if(length!==0||offset!==0)throw new Error(`HEX line ${index+1}: invalid EOF record`);eof=true}
      else if(type===2){if(length!==2)throw new Error(`HEX line ${index+1}: invalid segment address`);base=(((payload[0]<<8)|payload[1])<<4)>>>0}
      else if(type===4){if(length!==2)throw new Error(`HEX line ${index+1}: invalid linear address`);base=(((payload[0]<<8)|payload[1])*0x10000)>>>0}
      else if(type!==3&&type!==5)throw new Error(`HEX line ${index+1}: unsupported record type ${type}`);
    });
    if(!eof)throw new Error("HEX file has no EOF record");
    if(!records.length)throw new Error("HEX file contains no firmware data");
    records.sort((a,b)=>a.address-b.address);
    const segments=[];
    for(const record of records){
      const previous=segments.at(-1);
      if(previous&&record.address<previous.address+previous.data.length)throw new Error(`HEX contains overlapping data at 0x${record.address.toString(16).toUpperCase()}`);
      if(previous&&record.address===previous.address+previous.data.length){
        const joined=new Uint8Array(previous.data.length+record.data.length);joined.set(previous.data);joined.set(record.data,previous.data.length);previous.data=joined;
      }else segments.push({address:record.address,data:record.data});
    }
    return {segments,totalBytes,start:segments[0].address,end:Math.max(...segments.map(segment=>segment.address+segment.data.length)),readU32};
  }
  return {parse,readU32};
})();

if(typeof window!=="undefined")window.FlightCodeIntelHex=FlightCodeIntelHex;

(()=>{
  if(typeof document==="undefined")return;
  const $=selector=>document.querySelector(selector);
  const FLASH_START=0x08000000;
  const TARGETS={
    MAMBAF411:{label:"Mamba F411",filename:"MAMBAF411",firmwareEnd:0x08040000,flashEnd:0x08080000,sectors:[16,16,16,16,64,128,128,128]},
    CLRACINGF4:{label:"CLRacing F4",filename:"CLRACINGF4",firmwareEnd:0x080c0000,flashEnd:0x08100000,sectors:[16,16,16,16,64,128,128,128,128,128,128,128]}
  };
  const state={image:null,file:null,fileError:"",detectedBoard:"",device:null,session:null,busy:false};
  const ui={target:$("#firmwareTarget"),file:$("#firmwareFile"),fileName:$("#firmwareFileName"),size:$("#firmwareSize"),range:$("#firmwareRange"),validation:$("#firmwareValidation"),dfuState:$("#firmwareDfuState"),enter:$("#firmwareEnterDfuButton"),connect:$("#firmwareConnectDfuButton"),flash:$("#firmwareFlashButton"),safety:$("#firmwareSafetyCheck"),progress:$("#firmwareProgress"),progressText:$("#firmwareProgressText"),log:$("#firmwareLog")};

  const hex=value=>`0x${value.toString(16).toUpperCase().padStart(8,"0")}`;
  const log=text=>{ui.log.textContent+=`${new Date().toLocaleTimeString()}  ${text}\n`;ui.log.scrollTop=ui.log.scrollHeight};
  const progress=(value,text)=>{ui.progress.style.width=`${Math.max(0,Math.min(100,value))}%`;ui.progressText.textContent=text};
  function badge(text,type=""){ui.dfuState.textContent=text;ui.dfuState.className=`badge ${type}`}
  function selectedTarget(){return TARGETS[ui.target.value]||null}
  function setBusy(value){state.busy=value;ui.target.disabled=value;ui.file.disabled=value;ui.enter.disabled=value;ui.connect.disabled=value;updateReady()}
  function validateImage(){
    const target=selectedTarget(),image=state.image;
    if(state.fileError)return {ok:false,message:state.fileError};
    if(!image)return {ok:false,message:"Select a FlightCode .hex firmware file."};
    if(!target)return {ok:false,message:"Select the destination flight controller."};
    const upper=state.file.name.toUpperCase();
    if(!upper.includes(target.filename))return {ok:false,message:`The filename does not identify ${target.label}.`};
    if(state.detectedBoard&&state.detectedBoard!==ui.target.value)return {ok:false,message:`Connected board is ${state.detectedBoard}, but ${target.label} is selected.`};
    if(image.start!==FLASH_START)return {ok:false,message:`Firmware must start at ${hex(FLASH_START)}.`};
    if(image.end>target.firmwareEnd)return {ok:false,message:`Firmware reaches ${hex(image.end)} and would enter the reserved log/settings area.`};
    if(image.segments.some(segment=>segment.address<FLASH_START||segment.address+segment.data.length>target.firmwareEnd))return {ok:false,message:"Firmware contains data outside the permitted application flash."};
    const first=image.segments[0];
    if(first.data.length<8)return {ok:false,message:"Firmware vector table is incomplete."};
    const stack=FlightCodeIntelHex.readU32(first.data,0),reset=FlightCodeIntelHex.readU32(first.data,4);
    if((stack&0xff000000)!==0x20000000)return {ok:false,message:`Invalid initial stack pointer ${hex(stack)}.`};
    const resetAddress=reset&~1;
    if((reset&1)===0||resetAddress<FLASH_START||resetAddress>=target.firmwareEnd)return {ok:false,message:`Invalid reset vector ${hex(reset)}.`};
    return {ok:true,message:`Valid ${target.label} firmware · settings and flight-log sectors are protected.`};
  }
  function updateReady(){
    const validation=validateImage();
    ui.validation.textContent=validation.message;ui.validation.className=validation.ok?"firmware-validation ok":"firmware-validation";
    ui.enter.disabled=state.busy||!window.flightCodeConfigurator?.canEnterDfu?.();
    ui.connect.disabled=state.busy||!("usb" in navigator);
    ui.flash.disabled=state.busy||!validation.ok||!state.session||!ui.safety.checked;
  }
  function setDetectedBoard(board){
    if(TARGETS[board]){state.detectedBoard=board;ui.target.value=board;log(`Detected board: ${TARGETS[board].label}`)}
    updateReady();
  }

  function sectorsForTarget(target){
    let address=FLASH_START;
    return target.sectors.map(sizeKiB=>{const sector={address,size:sizeKiB*1024};address+=sector.size;return sector});
  }
  function sectorsForImage(target,image){
    return sectorsForTarget(target).filter(sector=>image.segments.some(segment=>segment.address<sector.address+sector.size&&segment.address+segment.data.length>sector.address));
  }

  class Stm32DfuSession{
    constructor(device){this.device=device;this.interfaceNumber=0;this.alternateSetting=0;this.transferSize=2048;this.memoryName="Internal Flash"}
    setup(request){return {requestType:"class",recipient:"interface",request,value:0,index:this.interfaceNumber}}
    async out(request,value,data=new Uint8Array()){const result=await this.device.controlTransferOut({...this.setup(request),value},data);if(result.status!=="ok")throw new Error(`DFU OUT request ${request} failed: ${result.status}`);return result}
    async input(request,value,length){const result=await this.device.controlTransferIn({...this.setup(request),value},length);if(result.status!=="ok"||!result.data)throw new Error(`DFU IN request ${request} failed: ${result.status}`);return new Uint8Array(result.data.buffer,result.data.byteOffset,result.data.byteLength)}
    async open(){
      if(!this.device.opened)await this.device.open();
      if(!this.device.configuration)await this.device.selectConfiguration(1);
      let selected=null;
      for(const iface of this.device.configuration.interfaces){for(const alternate of iface.alternates){if(alternate.interfaceClass===0xfe&&alternate.interfaceSubclass===1){const candidate={iface:iface.interfaceNumber,alternate:alternate.alternateSetting,name:alternate.interfaceName||"DFU flash"};if(!selected||/internal flash/i.test(candidate.name))selected=candidate}}}
      if(!selected)throw new Error("The selected USB device has no DFU interface");
      this.interfaceNumber=selected.iface;this.alternateSetting=selected.alternate;this.memoryName=selected.name;
      await this.device.claimInterface(this.interfaceNumber);
      await this.device.selectAlternateInterface(this.interfaceNumber,this.alternateSetting);
      await this.ensureIdle();
    }
    async getStatus(){const data=await this.input(3,0,6);return {status:data[0],pollTimeout:data[1]|(data[2]<<8)|(data[3]<<16),state:data[4]}}
    async clearStatus(){await this.out(4,0)}
    async abort(){await this.out(6,0)}
    async ensureIdle(){
      for(let attempt=0;attempt<5;attempt++){
        const status=await this.getStatus();
        if(status.state===2)return;
        if(status.state===10)await this.clearStatus();
        else if([3,4,5,6,9].includes(status.state))await this.abort();
        else if(status.state===8)throw new Error("DFU device is waiting for a USB reset");
        await new Promise(resolve=>setTimeout(resolve,Math.max(1,status.pollTimeout)));
      }
      const status=await this.getStatus();if(status.state!==2)throw new Error(`DFU device did not reach idle state (state ${status.state})`);
    }
    async waitDownload(){
      for(let attempt=0;attempt<80;attempt++){
        const status=await this.getStatus();
        if(status.status!==0)throw new Error(`DFU status error ${status.status}`);
        if(status.state===5||status.state===2)return;
        if(![3,4].includes(status.state))throw new Error(`Unexpected DFU download state ${status.state}`);
        await new Promise(resolve=>setTimeout(resolve,Math.max(1,status.pollTimeout)));
      }
      throw new Error("DFU operation timed out");
    }
    async setAddress(address){const command=new Uint8Array(5);command[0]=0x21;new DataView(command.buffer).setUint32(1,address,true);await this.out(1,0,command);await this.waitDownload()}
    async erasePage(address){const command=new Uint8Array(5);command[0]=0x41;new DataView(command.buffer).setUint32(1,address,true);await this.out(1,0,command);await this.waitDownload()}
    async writeSegment(segment,onBytes){
      await this.setAddress(segment.address);let offset=0,block=2;
      while(offset<segment.data.length){const chunk=segment.data.slice(offset,offset+this.transferSize);await this.out(1,block++,chunk);await this.waitDownload();offset+=chunk.length;onBytes(chunk.length)}
    }
    async verifySegment(segment,onBytes){
      await this.ensureIdle();await this.setAddress(segment.address);await this.abort();let offset=0,block=2;
      while(offset<segment.data.length){const length=Math.min(this.transferSize,segment.data.length-offset),actual=await this.input(2,block++,length);if(actual.length!==length)throw new Error(`Verify read returned ${actual.length} bytes instead of ${length}`);for(let i=0;i<length;i++)if(actual[i]!==segment.data[offset+i])throw new Error(`Verification failed at ${hex(segment.address+offset+i)}`);offset+=length;onBytes(length)}
      await this.abort();
    }
    async leave(address){await this.ensureIdle();await this.setAddress(address);await this.out(1,0,new Uint8Array());try{await this.getStatus()}catch{/* A successful manifestation normally disconnects USB immediately. */}}
    async close(){try{if(this.device.opened)await this.device.releaseInterface(this.interfaceNumber)}catch{}try{if(this.device.opened)await this.device.close()}catch{}}
  }

  async function loadFile(file){
    state.file=file;state.image=null;state.fileError="";ui.fileName.textContent=file?.name||"No file selected";ui.size.textContent="—";ui.range.textContent="—";
    if(!file){updateReady();return}
    try{
      if(!file.name.toLowerCase().endsWith(".hex"))throw new Error("Select an Intel HEX (.hex) file");
      const image=FlightCodeIntelHex.parse(await file.text());state.image=image;
      ui.size.textContent=`${image.totalBytes.toLocaleString()} B`;ui.range.textContent=`${hex(image.start)} – ${hex(image.end-1)}`;
      const filename=file.name.toUpperCase(),match=Object.entries(TARGETS).find(([,target])=>filename.includes(target.filename));if(match&&!state.detectedBoard)ui.target.value=match[0];
      log(`Loaded ${file.name} · ${image.totalBytes.toLocaleString()} bytes`);
    }catch(error){state.fileError=error.message;log(`File rejected: ${error.message}`)}
    updateReady();
  }
  async function connectDfu(){
    if(!("usb" in navigator)){log("WebUSB is not available. Use Chrome or Edge on localhost.");return}
    setBusy(true);progress(0,"Waiting for STM32 DFU device…");
    try{
      if(state.session)await state.session.close();
      state.device=await navigator.usb.requestDevice({filters:[{vendorId:0x0483,productId:0xdf11}]});
      state.session=new Stm32DfuSession(state.device);await state.session.open();
      badge("DFU CONNECTED","online");progress(0,"DFU ready");log(`Connected: ${state.device.productName||"STM32 Bootloader"} · ${state.session.memoryName}`);
    }catch(error){await state.session?.close();state.session=null;badge("DFU NOT CONNECTED");progress(0,"DFU connection failed");log(error.name==="NotFoundError"?"DFU selection cancelled":`DFU connection failed: ${error.message}`)}
    finally{setBusy(false)}
  }
  async function enterDfu(){
    if(!window.flightCodeConfigurator?.canEnterDfu?.()){log("Connect a supported, disarmed STM32 board first.");return}
    if(!confirm("Restart the connected flight controller in DFU mode?"))return;
    const board=window.flightCodeConfigurator.board();if(TARGETS[board])setDetectedBoard(board);
    log("Requesting DFU mode. After disconnection, press Connect DFU.");await window.flightCodeConfigurator.enterDfu();
  }
  async function flash(){
    const validation=validateImage(),target=selectedTarget(),image=state.image;if(!validation.ok||!state.session)return;
    const pages=sectorsForImage(target,image);
    if(!confirm(`Flash ${state.file.name} to ${target.label}?\n\n${pages.length} flash sectors will be erased. Settings and flight logs will be preserved.`))return;
    setBusy(true);ui.safety.disabled=true;const total=image.totalBytes;let written=0,verified=0;
    try{
      badge("FLASHING","armed");progress(3,"Preparing DFU…");log(`Target confirmed: ${target.label}`);await state.session.ensureIdle();
      for(let i=0;i<pages.length;i++){progress(5+(i/pages.length)*17,`Erasing sector ${i+1} of ${pages.length}…`);log(`Erasing ${hex(pages[i].address)} · ${pages[i].size/1024} KiB`);await state.session.erasePage(pages[i].address)}
      for(const segment of image.segments){log(`Writing ${segment.data.length.toLocaleString()} bytes at ${hex(segment.address)}`);await state.session.writeSegment(segment,count=>{written+=count;progress(22+(written/total)*50,`Writing firmware · ${Math.round(written/total*100)}%`)})}
      log("Write complete. Starting byte-for-byte verification.");
      for(const segment of image.segments)await state.session.verifySegment(segment,count=>{verified+=count;progress(72+(verified/total)*26,`Verifying firmware · ${Math.round(verified/total*100)}%`)});
      progress(99,"Verification successful · rebooting…");log("Verification successful. Starting firmware.");await state.session.leave(FLASH_START);
      progress(100,"Firmware installed successfully");badge("FLASHED","online");log("Flash completed. Reconnect the board after USB enumeration.");state.session=null;
    }catch(error){badge("FLASH FAILED","armed");progress(0,"Flash failed");log(`FLASH FAILED: ${error.message}`);try{await state.session?.ensureIdle()}catch{}}
    finally{ui.safety.disabled=false;setBusy(false)}
  }

  ui.file.onchange=event=>loadFile(event.target.files?.[0]||null);
  ui.target.onchange=updateReady;ui.safety.onchange=updateReady;ui.enter.onclick=enterDfu;ui.connect.onclick=connectDfu;ui.flash.onclick=flash;
  window.firmwareFlasher={setDetectedBoard,updateReady};
  badge("WAITING");progress(0,"Select a target and firmware file");updateReady();
})();
