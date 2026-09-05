const FlightCodeBlackboxLogic=(()=>{
  function stopReasonName(flags){
    return (flags&8)!==0?"IMU_FAILURE":(flags&16)!==0?"SBUS_FAILSAFE":
      (flags&32)!==0?"SBUS_TIMEOUT":(flags&4)!==0?"RX_LOSS":
      (flags&2)!==0?"DISARM":"UNKNOWN";
  }

  function decodeRecord(values,index,rate=200){
    if(values.length<29)return null;
    const flags=values[11],mainLoopUs=values[12],gyroLoopUs=values[13];
    const pTerm=values.slice(17,20).map(v=>v/2),iTerm=values.slice(20,23).map(v=>v/2);
    const legacyDTerm=values.slice(23,26).map(v=>v/2),ffTerm=values.slice(26,29).map(v=>v/2);
    const extended=values.length>=43;
    const dTerm=extended?values.slice(36,39).map(v=>v/100):legacyDTerm;
    const pid=extended?values.slice(40,43).map(v=>v/2):pTerm.map((value,axis)=>{
      const limit=axis===2?25:35,sum=value+iTerm[axis]+dTerm[axis]+ffTerm[axis];
      return Number(Math.max(-limit,Math.min(limit,sum)).toFixed(2));
    });
    return {t:Number((index/rate).toFixed(5)),gyro:values.slice(0,3).map(v=>v/10),
      setpoint:values.slice(3,6).map(v=>v/10),pid,
      motors:values.slice(6,10).map(v=>Number((v*100/255).toFixed(2))),
      throttle:values[10]/2,mixerSaturated:(flags&1)!==0,stopReason:stopReasonName(flags),
      mainLoopUs,mainLoopHz:mainLoopUs?Number((1000000/mainLoopUs).toFixed(2)):0,
      gyroLoopUs,gyroLoopHz:gyroLoopUs?Number((1000000/gyroLoopUs).toFixed(2)):0,
      batteryVoltage:values[14]/100,cellVoltage:values[15]/100,batteryCells:values[16],
      pTerm,iTerm,dTerm,ffTerm,
      timestampUs:extended?values[29]:null,
      gyroRaw:extended?values.slice(30,33).map(v=>v/10):values.slice(0,3).map(v=>v/10),
      dTermUnfiltered:extended?values.slice(33,36).map(v=>v/100):legacyDTerm,
      dTermFiltered:dTerm,droppedRecords:extended?values[39]:0};
  }

  function decodeBinaryRecord(bytes,index,rate=200,batteryCells=0){
    if(!bytes||bytes.byteLength<48)return null;
    const view=new DataView(bytes.buffer,bytes.byteOffset,48);
    const i16=offset=>view.getInt16(offset,true),u16=offset=>view.getUint16(offset,true);
    const timestampUs=view.getUint32(0,true),flags=view.getUint8(39);
    const gyroRaw=[i16(4),i16(6),i16(8)].map(v=>v/10);
    const gyro=[i16(10),i16(12),i16(14)].map(v=>v/10);
    const setpoint=[i16(16),i16(18),i16(20)].map(v=>v/10);
    const dTermUnfiltered=[i16(22),i16(24),i16(26)].map(v=>v/100);
    const dTerm=[i16(28),i16(30),i16(32)].map(v=>v/100);
    const batteryCentivolts=u16(43);
    return {t:Number((index/rate).toFixed(5)),gyro,setpoint,
      pid:[view.getInt8(40),view.getInt8(41),view.getInt8(42)].map(v=>v/2),
      motors:[34,35,36,37].map(offset=>Number((view.getUint8(offset)*100/255).toFixed(2))),
      throttle:view.getUint8(38)/2,mixerSaturated:(flags&1)!==0,stopReason:stopReasonName(flags),
      mainLoopUs:0,mainLoopHz:0,gyroLoopUs:0,gyroLoopHz:0,
      batteryVoltage:batteryCentivolts/100,
      cellVoltage:batteryCells?Math.floor(batteryCentivolts/batteryCells)/100:0,batteryCells,
      pTerm:[0,0,0],iTerm:[0,0,0],dTerm,ffTerm:[0,0,0],timestampUs,gyroRaw,
      dTermUnfiltered,dTermFiltered:dTerm,droppedRecords:u16(45)};
  }

  function addMissingSector(ranges,start,count,sector){
    if(!Array.isArray(ranges)||!Number.isFinite(start)||!Number.isFinite(count)||count<=0)return;
    const last=ranges.at(-1),lastSector=last?.lastSector??last?.sector;
    if(last&&last.start+last.count===start&&lastSector+1===sector){
      last.count+=count;last.lastSector=sector;return;
    }
    ranges.push({start,count,sector,lastSector:sector});
  }

  function missingSectorCount(ranges){
    return (ranges||[]).reduce((total,range)=>total+
      (Number.isFinite(range.lastSector)&&Number.isFinite(range.sector)
        ?Math.max(1,range.lastSector-range.sector+1):Math.ceil(range.count/10)),0);
  }

  function buildMetadata(core,tuning,pids){
    if(!core||!tuning||!pids)return null;
    const t=tuning,value=t[16];
    const throttleRiseMs=core.version>=3&&Number.isFinite(value)&&value>=0&&value<=1000?value:null;
    return {...core,pids,rates:{roll:t[0],pitch:t[1],yaw:t[2],expo:t[3]},
      feedforward:{roll:t[4],pitch:t[5],yaw:t[6]},tpa:{attenuation:t[7]*100,breakpoint:t[8]},
      filters:{gyro:t[9],dterm:t[10],dynamicD:t[15]??0},alignment:t.slice(11,14),
      motorIdlePercent:t[14],throttleRiseMs};
  }

  return {stopReasonName,decodeRecord,decodeBinaryRecord,addMissingSector,missingSectorCount,buildMetadata};
})();
