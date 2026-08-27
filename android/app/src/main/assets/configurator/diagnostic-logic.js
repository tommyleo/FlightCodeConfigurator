const FlightCodeDiagnosticLogic=(()=>{
  /* Universal Quad X: M1 rear-right, M2 front-right, M3 rear-left, M4 front-left. */
  const motorProjection=[
    m=>(-m[0]-m[1]+m[2]+m[3])/4,
    m=>(-m[0]+m[1]-m[2]+m[3])/4,
    m=>(-m[0]+m[1]+m[2]-m[3])/4
  ];

  function receiverChannelIndex(order){
    return order==="AETR1234"
      ?{roll:0,pitch:1,throttle:2,yaw:3}
      :{throttle:0,roll:1,pitch:2,yaw:3};
  }

  function imuSummary(samples){
    const byStage=key=>samples.filter(s=>s.stage===key);
    const byAxis=axis=>samples.filter(s=>s.axis===axis);
    const peak=(rows,index)=>rows.reduce((v,s)=>Math.max(v,Math.abs(s.gyro[index])),0);
    const gyroIntegral=(rows,index)=>rows.slice(1).reduce((total,s,i)=>{
      const dt=Math.max(0,Math.min(.05,(s.timestampUs-rows[i].timestampUs)/1e6));
      return total+(rows[i].gyro[index]+s.gyro[index])*.5*dt;
    },0);
    const accelMean=(rows,index)=>{
      const settled=rows.slice(Math.floor(rows.length*.65));
      return settled.length?settled.reduce((total,s)=>total+s.accel[index],0)/settled.length:0;
    };
    const motionDefinitions={
      roll:{axis:0,positive:"roll_p90",negative:"roll_n90"},
      pitch:{axis:1,positive:"pitch_p90",negative:"pitch_n90"},
      yaw:{axis:2,positive:"yaw_p90",negative:"yaw_n90"}
    };
    const gyroMotion={};
    const gyroAxisDirection={};
    const gyroAxisIsolation={};
    Object.entries(motionDefinitions).forEach(([name,definition])=>{
      const positive=[0,1,2].map(index=>gyroIntegral(byStage(definition.positive),index));
      const negative=[0,1,2].map(index=>gyroIntegral(byStage(definition.negative),index));
      const other=[0,1,2].filter(index=>index!==definition.axis);
      gyroMotion[name]={
        positiveDeg:positive.map(value=>Number(value.toFixed(2))),
        negativeDeg:negative.map(value=>Number(value.toFixed(2)))
      };
      gyroAxisDirection[name]=positive[definition.axis]>30&&negative[definition.axis]<-30;
      gyroAxisIsolation[name]=[positive,negative].every(values=>
        Math.abs(values[definition.axis])>1.5*Math.max(5,...other.map(index=>Math.abs(values[index]))));
    });
    const accelPoses={
      levelStart:{stage:"plane_start",axis:2,sign:1},levelEnd:{stage:"plane_end",axis:2,sign:1},
      rollPositive:{stage:"roll_p90",axis:1,sign:1},rollNegative:{stage:"roll_n90",axis:1,sign:-1},
      pitchPositive:{stage:"pitch_p90",axis:0,sign:-1},pitchNegative:{stage:"pitch_n90",axis:0,sign:1}
    };
    const accelOrientation={};
    const accelPoseVectors={};
    Object.entries(accelPoses).forEach(([name,pose])=>{
      const values=[0,1,2].map(index=>accelMean(byStage(pose.stage),index));
      const other=[0,1,2].filter(index=>index!==pose.axis);
      accelPoseVectors[name]=values.map(value=>Number(value.toFixed(3)));
      accelOrientation[name]=pose.sign*values[pose.axis]>.6&&
        Math.abs(values[pose.axis])>1.5*Math.max(.1,...other.map(index=>Math.abs(values[index])));
    });
    const stationary=byStage("plane_start");
    const meanNorm=stationary.length?stationary.reduce((v,s)=>v+Math.hypot(...s.accel),0)/stationary.length:0;
    const quaternionNormErrors=samples.map(s=>Math.abs(1-Math.hypot(...s.quaternion)));
    const checks={
      accelNorm:Number(meanNorm.toFixed(4)),
      rollPeakDps:Number(peak(byAxis("roll"),0).toFixed(3)),
      pitchPeakDps:Number(peak(byAxis("pitch"),1).toFixed(3)),
      yawPeakDps:Number(peak(byAxis("yaw"),2).toFixed(3)),
      gyroMotion,gyroAxisDirection,gyroAxisIsolation,accelPoseVectors,accelOrientation,
      maxQuaternionNormError:Number(Math.max(0,...quaternionNormErrors).toFixed(8)),
      finalAttitude:samples.at(-1)?.attitude||null
    };
    checks.sensorActive=checks.rollPeakDps>5||checks.pitchPeakDps>5||checks.yawPeakDps>5;
    checks.accelerometerPlausible=checks.accelNorm>.75&&checks.accelNorm<1.25;
    checks.axesResponsive={roll:checks.rollPeakDps>5,pitch:checks.pitchPeakDps>5,yaw:checks.yawPeakDps>5};
    checks.ok=checks.sensorActive&&checks.accelerometerPlausible&&
      Object.values(checks.axesResponsive).every(Boolean)&&
      Object.values(checks.gyroAxisDirection).every(Boolean)&&
      Object.values(checks.gyroAxisIsolation).every(Boolean)&&
      Object.values(checks.accelOrientation).every(Boolean);
    return checks;
  }

  function correlation(rows,axis,mix){
    if(rows.length<2)return 0;
    const av=rows.reduce((v,s)=>v+s.gyro[axis],0)/rows.length,bv=rows.reduce((v,s)=>v+mix(s.motors),0)/rows.length;
    let n=0,da=0,db=0;
    for(const s of rows){const a=s.gyro[axis]-av,b=mix(s.motors)-bv;n+=a*b;da+=a*a;db+=b*b}
    return da>0&&db>0?n/Math.sqrt(da*db):0;
  }

  function pidSummary(samples,direction,loopHz,maxLoopPeriodUs){
    const stage=key=>samples.filter(s=>s.stage===key);
    const correlations={
      roll:Number(correlation(stage("feedbackRoll"),0,motorProjection[0]).toFixed(3)),
      pitch:Number(correlation(stage("feedbackPitch"),1,motorProjection[1]).toFixed(3)),
      yaw:Number(correlation(stage("feedbackYaw"),2,motorProjection[2]).toFixed(3))
    };
    const expected={roll:correlations.roll<-.2,pitch:correlations.pitch<-.2,
      yaw:direction==="REVERSED"?correlations.yaw>.2:correlations.yaw<-.2};
    const feedbackExcursion={
      roll:Number((Math.max(0,...stage("feedbackRoll").map(s=>motorProjection[0](s.motors)))-Math.min(0,...stage("feedbackRoll").map(s=>motorProjection[0](s.motors)))).toFixed(2)),
      pitch:Number((Math.max(0,...stage("feedbackPitch").map(s=>motorProjection[1](s.motors)))-Math.min(0,...stage("feedbackPitch").map(s=>motorProjection[1](s.motors)))).toFixed(2)),
      yaw:Number((Math.max(0,...stage("feedbackYaw").map(s=>motorProjection[2](s.motors)))-Math.min(0,...stage("feedbackYaw").map(s=>motorProjection[2](s.motors)))).toFixed(2))
    };
    const maxSpread=Math.max(0,...samples.map(s=>Math.max(...s.motors)-Math.min(...s.motors)));
    const commandPeak={
      throttleAverage:Number(Math.max(0,...stage("throttle50").map(s=>s.motors.reduce((a,b)=>a+b,0)/4)).toFixed(2)),
      roll:Number(Math.max(0,...stage("commandRoll").map(s=>motorProjection[0](s.motors))).toFixed(2)),
      pitch:Number(Math.max(0,...stage("commandPitch").map(s=>-motorProjection[1](s.motors))).toFixed(2)),
      yaw:Number(Math.max(0,...stage("commandYaw").map(s=>(direction==="REVERSED"?-1:1)*motorProjection[2](s.motors))).toFixed(2))
    };
    const feedbackSignal=Object.fromEntries(Object.entries(feedbackExcursion).map(([axis,value])=>[axis,value>=2]));
    const commandResponse={throttle:commandPeak.throttleAverage>=25,roll:commandPeak.roll>=2,pitch:commandPeak.pitch>=2,yaw:commandPeak.yaw>=2};
    return {correlations,expectedOpposition:expected,feedbackExcursion,feedbackSignal,commandPeak,commandResponse,
      maxMotorSpreadPercent:Number(maxSpread.toFixed(2)),loopHz,maxLoopPeriodUs,
      ok:Object.values(expected).every(Boolean)&&Object.values(feedbackSignal).every(Boolean)&&
        Object.values(commandResponse).every(Boolean)&&maxSpread>1};
  }

  return {motorProjection,receiverChannelIndex,imuSummary,pidSummary};
})();
