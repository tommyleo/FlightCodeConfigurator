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

  return {stopReasonName,decodeRecord};
})();
