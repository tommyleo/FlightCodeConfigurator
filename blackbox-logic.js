const FlightCodeBlackboxLogic=(()=>{
  function stopReasonName(flags){
    return (flags&8)!==0?"IMU_FAILURE":(flags&16)!==0?"SBUS_FAILSAFE":
      (flags&32)!==0?"SBUS_TIMEOUT":(flags&4)!==0?"RX_LOSS":
      (flags&2)!==0?"DISARM":"UNKNOWN";
  }

  function decodeRecord(values,index,rate=200){
    const flags=values[14];
    return {t:Number((index/rate).toFixed(5)),gyro:values.slice(0,3).map(v=>v/10),
      setpoint:values.slice(3,6).map(v=>v/10),pid:values.slice(6,9).map(v=>v/2),
      motors:values.slice(9,13).map(v=>Number((v*100/255).toFixed(2))),
      throttle:values[13]/2,mixerSaturated:(flags&1)!==0,stopReason:stopReasonName(flags),loopUs:values[15],
      batteryVoltage:values.length>=19?values[16]/100:0,cellVoltage:values.length>=19?values[17]/100:0,
      batteryCells:values.length>=19?values[18]:0,pTerm:values.length>=28?values.slice(19,22).map(v=>v/2):[0,0,0],
      iTerm:values.length>=28?values.slice(22,25).map(v=>v/2):[0,0,0],
      dTerm:values.length>=28?values.slice(25,28).map(v=>v/2):[0,0,0],
      ffTerm:values.length>=31?values.slice(28,31).map(v=>v/2):[0,0,0]};
  }

  return {stopReasonName,decodeRecord};
})();
