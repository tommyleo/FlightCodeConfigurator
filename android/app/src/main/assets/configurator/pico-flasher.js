const FlightCodeUf2=(()=>{
  const BLOCK_SIZE=512;
  const MAGIC_START0=0x0a324655;
  const MAGIC_START1=0x9e5d5157;
  const MAGIC_END=0x0ab16f30;
  const FLAG_NOT_MAIN_FLASH=0x00000001;
  const FLAG_FILE_CONTAINER=0x00001000;
  const FLAG_FAMILY_ID_PRESENT=0x00002000;
  const FLAG_EXTENSION_FLAGS_PRESENT=0x00008000;
  const ABSOLUTE_FAMILY_ID=0xe48bff57;
  const RP2350_ARM_S_FAMILY_ID=0xe48bff59;
  const EXTENSION_IGNORE_BLOCK=0x9957e304;

  function bytesFrom(source){
    if(ArrayBuffer.isView(source))return new Uint8Array(source.buffer,source.byteOffset,source.byteLength);
    return new Uint8Array(source);
  }

  function parse(source){
    const bytes=bytesFrom(source);
    if(!bytes.byteLength||bytes.byteLength%BLOCK_SIZE!==0)throw new Error("UF2 file size must be a non-zero multiple of 512 bytes");
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const blocks=[];
    let expectedBlocks=null,auxiliaryBlocks=0;
    for(let offset=0;offset<bytes.byteLength;offset+=BLOCK_SIZE){
      const number=offset/BLOCK_SIZE+1;
      if(view.getUint32(offset,true)!==MAGIC_START0||view.getUint32(offset+4,true)!==MAGIC_START1||view.getUint32(offset+508,true)!==MAGIC_END)throw new Error(`UF2 block ${number}: invalid magic value`);
      const flags=view.getUint32(offset+8,true),address=view.getUint32(offset+12,true),payloadSize=view.getUint32(offset+16,true),blockNumber=view.getUint32(offset+20,true),blockCount=view.getUint32(offset+24,true),familyId=view.getUint32(offset+28,true);
      if(!(flags&FLAG_FAMILY_ID_PRESENT))throw new Error(`UF2 block ${number}: missing family identifier`);
      if(!payloadSize||payloadSize>476)throw new Error(`UF2 block ${number}: invalid payload size`);
      if(address+payloadSize>0x100000000)throw new Error(`UF2 block ${number}: address exceeds 32-bit range`);
      if(familyId!==RP2350_ARM_S_FAMILY_ID){
        const extensionOffset=offset+32+payloadSize;
        const ignored=familyId===ABSOLUTE_FAMILY_ID&&(flags&FLAG_EXTENSION_FLAGS_PRESENT)&&extensionOffset+4<=offset+508&&view.getUint32(extensionOffset,true)===EXTENSION_IGNORE_BLOCK;
        if(!ignored)throw new Error(`UF2 block ${number}: unsupported family 0x${familyId.toString(16).toUpperCase()}`);
        auxiliaryBlocks++;
        continue;
      }
      if(flags&(FLAG_NOT_MAIN_FLASH|FLAG_FILE_CONTAINER))throw new Error(`UF2 block ${number}: block does not target main flash`);
      if(payloadSize!==256)throw new Error(`UF2 block ${number}: FlightCodePI flash blocks must contain 256 bytes`);
      if(!blockCount||blockNumber>=blockCount)throw new Error(`UF2 block ${number}: invalid sequence number`);
      if(expectedBlocks===null)expectedBlocks=blockCount;
      else if(blockCount!==expectedBlocks)throw new Error(`UF2 block ${number}: inconsistent block count`);
      blocks.push({number:blockNumber,address,data:bytes.slice(offset+32,offset+32+payloadSize)});
    }
    if(!blocks.length)throw new Error("UF2 file contains no RP2350 ARM firmware data");
    if(blocks.length!==expectedBlocks)throw new Error(`UF2 file is incomplete: ${blocks.length} of ${expectedBlocks} firmware blocks`);
    blocks.sort((a,b)=>a.number-b.number);
    blocks.forEach((block,index)=>{if(block.number!==index)throw new Error(`UF2 file is missing firmware block ${index}`)});
    const byAddress=[...blocks].sort((a,b)=>a.address-b.address);
    const segments=[];
    for(const block of byAddress){
      const previous=segments.at(-1);
      if(previous&&block.address<previous.address+previous.data.length)throw new Error(`UF2 contains overlapping data at 0x${block.address.toString(16).toUpperCase()}`);
      if(previous&&block.address===previous.address+previous.data.length){
        const joined=new Uint8Array(previous.data.length+block.data.length);joined.set(previous.data);joined.set(block.data,previous.data.length);previous.data=joined;
      }else segments.push({address:block.address,data:block.data});
    }
    return {format:"uf2",segments,totalBytes:blocks.length*256,start:segments[0].address,end:Math.max(...segments.map(segment=>segment.address+segment.data.length)),familyId:RP2350_ARM_S_FAMILY_ID,auxiliaryBlocks};
  }

  return {parse,RP2350_ARM_S_FAMILY_ID};
})();

const FlightCodePicoboot=(()=>{
  const MAGIC=0x431fd10b;
  const STATUS_NAMES=["OK","UNKNOWN COMMAND","INVALID COMMAND LENGTH","INVALID TRANSFER LENGTH","INVALID ADDRESS","BAD ALIGNMENT","INTERLEAVED WRITE","REBOOTING","UNKNOWN ERROR","INVALID STATE","NOT PERMITTED","INVALID ARGUMENT","BUFFER TOO SMALL","PRECONDITION NOT MET","MODIFIED DATA","INVALID DATA","NOT FOUND","UNSUPPORTED MODIFICATION"];
  const commandPacket=(token,id,args=new Uint8Array(),transferLength=0)=>{
    if(args.byteLength>16)throw new Error("Picoboot command arguments exceed 16 bytes");
    const packet=new Uint8Array(32),view=new DataView(packet.buffer);
    view.setUint32(0,MAGIC,true);view.setUint32(4,token,true);packet[8]=id;packet[9]=args.byteLength;view.setUint32(12,transferLength,true);packet.set(args,16);
    return packet;
  };
  return {MAGIC,STATUS_NAMES,commandPacket};
})();

class Rp2350PicobootSession{
  constructor(device){this.device=device;this.interfaceNumber=0;this.alternateSetting=0;this.inEndpoint=0;this.outEndpoint=0;this.token=1;this.kind="pico";this.prepared=false;this.rebooting=false}
  async open(){
    if(!this.device.opened)await this.device.open();
    if(!this.device.configuration)await this.device.selectConfiguration(1);
    let selected=null;
    for(const iface of this.device.configuration.interfaces){for(const alternate of iface.alternates){const input=alternate.endpoints.find(endpoint=>endpoint.direction==="in"&&endpoint.type==="bulk"),output=alternate.endpoints.find(endpoint=>endpoint.direction==="out"&&endpoint.type==="bulk");if(alternate.interfaceClass===0xff&&input&&output){selected={interfaceNumber:iface.interfaceNumber,alternateSetting:alternate.alternateSetting,input:input.endpointNumber,output:output.endpointNumber};break}}if(selected)break}
    if(!selected)throw new Error("The selected USB device has no Picoboot interface");
    Object.assign(this,{interfaceNumber:selected.interfaceNumber,alternateSetting:selected.alternateSetting,inEndpoint:selected.input,outEndpoint:selected.output});
    await this.device.claimInterface(this.interfaceNumber);
    await this.device.selectAlternateInterface(this.interfaceNumber,this.alternateSetting);
    const reset=await this.device.controlTransferOut({requestType:"vendor",recipient:"interface",request:0x41,value:0,index:this.interfaceNumber},new Uint8Array());
    if(reset.status!=="ok")throw new Error(`Picoboot reset failed: ${reset.status}`);
  }
  async commandStatus(){
    const result=await this.device.controlTransferIn({requestType:"vendor",recipient:"interface",request:0x42,value:0,index:this.interfaceNumber},16);
    if(result.status!=="ok"||!result.data||result.data.byteLength!==16)return null;
    return {token:result.data.getUint32(0,true),code:result.data.getUint32(4,true),command:result.data.getUint8(8),inProgress:result.data.getUint8(9)!==0};
  }
  async command(id,args=new Uint8Array(),transfer=null){
    const reading=(id&0x80)!==0,data=reading?null:(transfer||new Uint8Array()),length=reading?Number(transfer)||0:data.byteLength,token=this.token++;
    try{
      const header=await this.device.transferOut(this.outEndpoint,FlightCodePicoboot.commandPacket(token,id,args,length));
      if(header.status!=="ok"||header.bytesWritten!==32)throw new Error(`command header ${header.status}`);
      let received=null;
      if(length){
        if(reading){const result=await this.device.transferIn(this.inEndpoint,length);if(result.status!=="ok"||!result.data||result.data.byteLength!==length)throw new Error(`read transfer ${result.status}`);received=new Uint8Array(result.data.buffer,result.data.byteOffset,result.data.byteLength).slice()}
        else{const result=await this.device.transferOut(this.outEndpoint,data);if(result.status!=="ok"||result.bytesWritten!==length)throw new Error(`write transfer ${result.status}`)}
      }
      if(reading){const ack=await this.device.transferOut(this.outEndpoint,new Uint8Array());if(ack.status!=="ok")throw new Error(`acknowledgement ${ack.status}`)}
      else{const ack=await this.device.transferIn(this.inEndpoint,1);if(ack.status!=="ok"||!ack.data||ack.data.byteLength!==0)throw new Error(`acknowledgement ${ack.status}`)}
      return received;
    }catch(error){
      const status=await this.commandStatus().catch(()=>null),name=status?FlightCodePicoboot.STATUS_NAMES[status.code]||`status ${status.code}`:"USB transfer error";
      throw new Error(`Picoboot command 0x${id.toString(16).toUpperCase()} failed: ${name} (${error.message})`);
    }
  }
  rangeArgs(address,size){const args=new Uint8Array(8),view=new DataView(args.buffer);view.setUint32(0,address,true);view.setUint32(4,size,true);return args}
  async prepare(){await this.command(0x01,Uint8Array.of(2));await this.command(0x06);this.prepared=true}
  async erase(address,size){await this.command(0x03,this.rangeArgs(address,size))}
  async write(address,data){await this.command(0x05,this.rangeArgs(address,data.byteLength),data)}
  async read(address,size){return this.command(0x84,this.rangeArgs(address,size),size)}
  async reboot(){
    const args=new Uint8Array(16),view=new DataView(args.buffer);view.setUint32(0,0x04,true);view.setUint32(4,500,true);view.setUint32(8,0,true);view.setUint32(12,0,true);this.rebooting=true;
    try{await this.command(0x0a,args)}catch(error){if(this.device.opened)throw error}
  }
  async close(){
    if(this.prepared&&!this.rebooting){try{await this.command(0x01,Uint8Array.of(0))}catch{}}
    try{if(this.device.opened)await this.device.releaseInterface(this.interfaceNumber)}catch{}
    try{if(this.device.opened)await this.device.close()}catch{}
  }
}

if(typeof window!=="undefined"){
  window.FlightCodeUf2=FlightCodeUf2;
  window.FlightCodePicoboot=FlightCodePicoboot;
  window.Rp2350PicobootSession=Rp2350PicobootSession;
}
