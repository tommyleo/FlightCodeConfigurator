const axes=[["roll","ROLL"],["pitch","PITCH"],["yaw","YAW"]],terms=["P","I","D"];
const channelNames=["Throttle","Roll","Pitch","Yaw","Buzzer","Arm"];
const state={port:null,reader:null,writer:null,task:null,connected:false,closing:false,buffer:"",heartbeat:null,motorHeartbeat:null,motorTest:false,armed:false,count:0,lastUs:null,calibrated:false,attitudeReady:false,gravityReference:null,q:[1,0,0,0],angle:{roll:0,pitch:0,yaw:0}};
const imuDiagnostic={running:false,stage:0,stageStarted:0,samples:[],file:null,timer:null,stages:[
  {key:"plane_start",axis:"still",target:[0,0,0],ms:3000,text:"Appoggia il quad fermo e perfettamente in piano"},
  {key:"roll_p90",axis:"roll",target:[90,0,0],ms:4000,text:"Porta lentamente il ROLL a +90° (fianco destro in basso) e mantieni"},
  {key:"roll_p180",axis:"roll",target:[180,0,0],ms:4000,text:"Continua il ROLL fino a +180° (quad capovolto) e mantieni"},
  {key:"roll_zero_1",axis:"roll",target:[0,0,0],ms:4000,text:"Riporta il quad in piano seguendo lo stesso asse ROLL"},
  {key:"roll_n90",axis:"roll",target:[-90,0,0],ms:4000,text:"Porta il ROLL a -90° (fianco sinistro in basso) e mantieni"},
  {key:"roll_n180",axis:"roll",target:[-180,0,0],ms:4000,text:"Continua il ROLL fino a -180° (quad capovolto) e mantieni"},
  {key:"roll_zero_2",axis:"roll",target:[0,0,0],ms:4000,text:"Riporta nuovamente il quad in piano"},
  {key:"pitch_p90",axis:"pitch",target:[0,90,0],ms:4000,text:"Alza il muso fino a PITCH +90° e mantieni"},
  {key:"pitch_p180",axis:"pitch",target:[0,180,0],ms:4000,text:"Continua fino a PITCH +180° (capovolto) e mantieni"},
  {key:"pitch_zero_1",axis:"pitch",target:[0,0,0],ms:4000,text:"Riporta il quad in piano lungo il PITCH"},
  {key:"pitch_n90",axis:"pitch",target:[0,-90,0],ms:4000,text:"Abbassa il muso fino a PITCH -90° e mantieni"},
  {key:"pitch_n180",axis:"pitch",target:[0,-180,0],ms:4000,text:"Continua fino a PITCH -180° (capovolto) e mantieni"},
  {key:"pitch_zero_2",axis:"pitch",target:[0,0,0],ms:4000,text:"Riporta nuovamente il quad in piano"},
  {key:"yaw_p90",axis:"yaw",target:[0,0,90],ms:4000,text:"Ruota il muso a destra fino a YAW +90° e mantieni"},
  {key:"yaw_p180",axis:"yaw",target:[0,0,180],ms:4000,text:"Continua verso destra fino a YAW +180° e mantieni"},
  {key:"yaw_zero_1",axis:"yaw",target:[0,0,0],ms:4000,text:"Riporta lo YAW alla direzione iniziale"},
  {key:"yaw_n90",axis:"yaw",target:[0,0,-90],ms:4000,text:"Ruota il muso a sinistra fino a YAW -90° e mantieni"},
  {key:"yaw_n180",axis:"yaw",target:[0,0,-180],ms:4000,text:"Continua verso sinistra fino a YAW -180° e mantieni"},
  {key:"yaw_zero_2",axis:"yaw",target:[0,0,0],ms:4000,text:"Riporta lo YAW alla direzione iniziale"},
  {key:"combined",axis:"combined",target:null,ms:5000,text:"Prova una posizione combinata libera su roll, pitch e yaw; non servono angoli precisi"},
  {key:"plane_end",axis:"still",target:[0,0,0],ms:3000,text:"Termina riportando il quad fermo e in piano"}
]};
const pidDiagnostic={running:false,stage:-1,stageStarted:0,samples:[],file:null,timer:null,aborted:false,abortMessage:"",detected:false,neutralSince:0,stages:[
  {key:"stabile",ms:2000,text:"Tieni il quad fermo con throttle a zero"},
  {key:"feedbackRoll",ms:4000,text:"Stick centrati: inclina a mano il quad a destra e sinistra"},
  {key:"feedbackPitch",ms:4000,text:"Stick centrati: alza e abbassa a mano il muso"},
  {key:"feedbackYaw",ms:4000,text:"Stick centrati: ruota a mano il muso a destra e sinistra"},
  {key:"throttle50",ms:4000,text:"Porta il THROTTLE circa al 50%, poi riportalo a zero"},
  {key:"commandRoll",ms:4000,text:"Porta ROLL verso destra (CH2 alto), poi ricentra"},
  {key:"commandPitch",ms:4000,text:"Porta PITCH verso CH3 alto, poi ricentra"},
  {key:"commandYaw",ms:4000,text:"Porta YAW verso destra (CH4 alto), poi ricentra"}
]};
const flightLog={count:0,rate:200,recording:false,downloading:false,records:[],receiverDiagnostics:null};
const tuningProfiles={
  balanced:{label:"BILANCIATO",pids:[.09,.2,.0012,.09,.2,.0012,.12,.2,0],expo:.35,ff:[.025,.025,.015],tpa:[0,65]},
  racing:{label:"RACING",pids:[.10,.2,.0012,.10,.2,.0012,.13,.2,0],expo:.15,ff:[.032,.032,.020],tpa:[20,65]},
  freestyle:{label:"FREESTYLE",pids:[.09,.22,.0014,.09,.22,.0014,.12,.22,0],expo:.35,ff:[.025,.025,.015],tpa:[0,65]}
};
const $=s=>document.querySelector(s);

axes.forEach(([key,label],axis)=>{
  const card=document.createElement("article");card.className="axis-card";
  card.innerHTML=`<header><b>${label}</b><small>ASSE 0${axis+1}</small></header><div class="axis-fields">${
    terms.map(term=>`<div class="pid-field"><label for="${key}${term}">${term}</label><input id="${key}${term}" data-pid type="number" min="0" max="1000" step="0.0001" value="0.0000" disabled></div>`).join("")
  }<div class="pid-field"><label for="${key}FF">FF</label><input id="${key}FF" data-feedforward type="number" min="0" max="1" step="0.001" value="0.000" disabled></div></div>`;
  $("#pidGrid").append(card);
});
for(let i=0;i<16;i++){
  const row=document.createElement("article");row.className="channel";
  row.innerHTML=`<div><b>CH${i+1}</b><small>${channelNames[i]||"Aux"}</small></div><div class="track"><i id="channelFill${i}"></i></div><output id="channelValue${i}">—</output>`;
  $("#channelGrid").append(row);
}
for(let i=0;i<4;i++){
  const row=document.createElement("div");row.className="motor-row";
  row.innerHTML=`<span>M${i+1}</span><div class="meter"><i id="motorFill${i}"></i></div><output id="motorValue${i}">0.0</output>`;
  $("#motorOutputs").append(row);
  const test=document.createElement("div");test.className="motor-test-card";
  test.innerHTML=`<div><strong>M${i+1}</strong><small>MOTORE ${i+1}</small></div><input id="motorTestSlider${i}" class="vertical-motor" type="range" min="0" max="100" step="1" value="0" disabled><output id="motorTestValue${i}">0%</output>`;
  $("#motorTestGrid").append(test);
}
const buttons={connect:$("#connectButton"),read:$("#readButton"),apply:$("#applyButton"),save:$("#saveButton"),reset:$("#resetButton")};
buttons.applyProtocol=$("#applyProtocolButton");
buttons.applyAlignment=$("#applyAlignmentButton");buttons.saveAlignment=$("#saveAlignmentButton");
buttons.applyMotorDirection=$("#applyMotorDirectionButton");
buttons.applyMotorIdle=$("#applyMotorIdleButton");
function view(name){document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===`${name}View`));document.querySelectorAll(".nav").forEach(v=>v.classList.toggle("active",v.dataset.view===name))}
document.querySelectorAll(".nav").forEach(v=>v.onclick=()=>view(v.dataset.view));
function badge(el,text,type=""){el.textContent=text;el.className=`badge ${type}`}
function saveState(text,type=""){const el=$("#saveState");el.textContent=text;el.className=`save-state ${type}`}
function updateDfuButton(){const button=$("#enterDfuButton");button.disabled=!state.connected||state.armed||state.motorTest}
function toast(text){const el=$("#toast");el.textContent=text;el.classList.add("visible");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("visible"),2400)}
function connected(value){
  state.connected=value;$("#connectionDot").classList.toggle("online",value);$("#deviceDot").classList.toggle("online",value);
  $("#connectionText").textContent=value?"FlightCode collegata":"Scheda non collegata";buttons.connect.textContent=value?"Disconnetti":"Connetti";
  document.querySelectorAll("[data-pid]").forEach(i=>i.disabled=!value);[buttons.read,buttons.apply,buttons.save,buttons.reset].forEach(b=>b.disabled=!value);
  document.querySelectorAll("[data-rate]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-feedforward]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-tpa]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-tuning-profile]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-alignment]").forEach(i=>i.disabled=!value);buttons.applyAlignment.disabled=!value;buttons.saveAlignment.disabled=!value;
  $("#motorProtocol").disabled=!value;buttons.applyProtocol.disabled=!value;
  $("#motorDirection").disabled=!value;buttons.applyMotorDirection.disabled=!value;
  $("#motorIdlePercent").disabled=!value;buttons.applyMotorIdle.disabled=!value;
  $("#motorSafetyCheck").disabled=!value;
  $("#startImuDiagnosticButton").disabled=!value;
  $("#calibrateGyroButton").disabled=!value;
  $("#pidDiagnosticSafety").disabled=!value;
  $("#startPidDiagnosticButton").disabled=!value||!$("#pidDiagnosticSafety").checked;
  $("#refreshFlightLogButton").disabled=!value;
  if(!value){$("#downloadFlightLogButton").disabled=true;flightLog.downloading=false}
  updateDfuButton();
  if(!value){$("#deviceName").textContent="Nessun dispositivo";$("#protocolText").textContent="USB seriale";badge($("#flightState"),"OFFLINE");badge($("#receiverState"),"NO SIGNAL");saveState("Non collegato")}
  if(!value){resetMotorTestUi();$("#pidDiagnosticSafety").checked=false}
  if(!value&&imuDiagnostic.running)cancelImuDiagnostic("Verifica interrotta: scheda scollegata.");
  if(!value&&pidDiagnostic.running)cancelPidDiagnostic("Verifica interrotta: scheda scollegata.");
}
function log(line,direction="RX"){
  if(line.includes("@CFG TELEMETRY")||line.startsWith("@CFG FLIGHT_LOG ")||line.startsWith("@CFG FLIGHT_LOG_CHUNK_END")||line==="PING")return;
  const out=$("#consoleOutput");if(!state.count)out.textContent="";out.textContent+=`${new Date().toLocaleTimeString()}  ${direction}  ${line}\n`;out.scrollTop=out.scrollHeight;
  $("#messageCount").textContent=`${++state.count} messaggi`;
}
async function send(command,visible=true){if(!state.writer)return;if(visible)log(command,"TX");await state.writer.write(new TextEncoder().encode(`${command}\n`))}
function resetAttitude(){
  state.q=[1,0,0,0];state.angle={roll:0,pitch:0,yaw:0};
  state.lastUs=null;state.attitudeReady=false;state.gravityReference=null;$("#quadModel").style.transform="";
}
function normalizeQuaternion(q){
  const n=Math.hypot(...q)||1;return q.map(v=>v/n);
}
function quaternionRenderMatrix(q){
  /*
   * The firmware has already applied the configured FC alignment.  CSS uses
   * the opposite visual handedness in our rear camera, so invert the rotation
   * vector for rendering (never for telemetry/PID).
   */
  /*
   * The CLRacingF4 and MAMBAF411 firmware mappings have opposite visual
   * pitch handedness after their target-specific IMU alignment.  Protocol
   * v1 did not report a board name and was MAMBA-only, so an unknown board
   * intentionally follows the MAMBA path for backward compatibility.
   */
  const [w,rawX,rawY,rawZ]=q;
  const x=-rawX,y=state.board==="CLRACINGF4"?rawY:-rawY,z=-rawZ;
  const r00=1-2*(y*y+z*z),r01=2*(x*y-w*z),r02=2*(x*z+w*y);
  const r10=2*(x*y+w*z),r11=1-2*(x*x+z*z),r12=2*(y*z-w*x);
  const r20=2*(x*z-w*y),r21=2*(y*z+w*x),r22=1-2*(x*x+y*y);
  /* The HTML model uses CSS X=pitch, CSS Y=roll and CSS Z=yaw. */
  const c00=r11,c01=r10,c02=r12,c10=r01,c11=r00,c12=r02,c20=r21,c21=r20,c22=r22;
  return [c00,c10,c20,0,c01,c11,c21,0,c02,c12,c22,0,0,0,0,1];
}
function renderQuaternion(q){
  $("#quadModel").style.transform=`matrix3d(${quaternionRenderMatrix(q).join(",")})`;
}
function attitude(timestamp,gyro,accel){
  let dt=state.lastUs===null?0:(timestamp-state.lastUs)/1e6;state.lastUs=timestamp;
  dt=Math.max(0,Math.min(.03,dt));
  const norm=Math.hypot(accel[0],accel[1],accel[2]);
  if(!state.attitudeReady&&norm>.5){
    /*
     * The setup model is relative to the pose in which it was reset.  Keep
     * that measured gravity vector as the world reference instead of
     * assuming that the FC itself is mounted perfectly level.
     */
    state.gravityReference=accel.map(v=>v/norm);
    state.q=[1,0,0,0];
    state.attitudeReady=true;
  }else if(dt>0&&state.attitudeReady){
    let [w,x,y,z]=state.q;
    let gx=gyro[0]*Math.PI/180,gy=gyro[1]*Math.PI/180,gz=gyro[2]*Math.PI/180;
    if(norm>.75&&norm<1.25){
      const ax=accel[0]/norm,ay=accel[1]/norm,az=accel[2]/norm;
      const [grx,gry,grz]=state.gravityReference||[0,0,1];
      const r00=1-2*(y*y+z*z),r01=2*(x*y-w*z),r02=2*(x*z+w*y);
      const r10=2*(x*y+w*z),r11=1-2*(x*x+z*z),r12=2*(y*z-w*x);
      const r20=2*(x*z-w*y),r21=2*(y*z+w*x),r22=1-2*(x*x+y*y);
      const vx=r00*grx+r10*gry+r20*grz;
      const vy=r01*grx+r11*gry+r21*grz;
      const vz=r02*grx+r12*gry+r22*grz;
      /*
       * Hand movements add linear/centripetal acceleration, so accelerometer
       * tilt is trustworthy only when rotation is slow.  Above 40 deg/s the
       * quaternion follows the gyro alone; near rest gravity quickly removes
       * the residual roll/pitch error and returns to the reset pose.
       */
      const gyroMagnitude=Math.hypot(...gyro);
      const correction=gyroMagnitude<=8?10:
        gyroMagnitude>=40?0:10*(40-gyroMagnitude)/32;
      gx+=correction*(ay*vz-az*vy);
      gy+=correction*(az*vx-ax*vz);
      gz+=correction*(ax*vy-ay*vx);
    }
    const dw=.5*(-x*gx-y*gy-z*gz),dx=.5*(w*gx+y*gz-z*gy);
    const dy=.5*(w*gy-z*gx+x*gz),dz=.5*(w*gz+x*gy-y*gx);
    state.q=normalizeQuaternion([w+dw*dt,x+dx*dt,y+dy*dt,z+dz*dt]);
  }
  const [w,x,y,z]=state.q;
  state.angle.roll=Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))*180/Math.PI;
  state.angle.pitch=Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x))))*180/Math.PI;
  state.angle.yaw=Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))*180/Math.PI;
  renderQuaternion(state.q);
  $("#gyroRoll").textContent=gyro[0].toFixed(1);$("#gyroPitch").textContent=gyro[1].toFixed(1);$("#gyroYaw").textContent=gyro[2].toFixed(1);
  $("#accelX").textContent=accel[0].toFixed(2);$("#accelY").textContent=accel[1].toFixed(2);$("#accelZ").textContent=accel[2].toFixed(2);
  $("#attitudeRoll").textContent=state.angle.roll.toFixed(1);$("#attitudePitch").textContent=state.angle.pitch.toFixed(1);$("#attitudeYaw").textContent=state.angle.yaw.toFixed(1);
}
function channels(values){values.forEach((value,i)=>{const pct=Math.max(0,Math.min(100,(value-1000)/10));$(`#channelFill${i}`).style.width=`${pct}%`;$(`#channelFill${i}`).style.background=i===4&&value>2000?"var(--orange)":"var(--cyan)";$(`#channelValue${i}`).textContent=`${Math.round(value)} µs`})}
function motors(values){values.forEach((value,i)=>{$(`#motorFill${i}`).style.width=`${Math.max(0,Math.min(100,value))}%`;$(`#motorValue${i}`).textContent=value.toFixed(1)})}
function diagnosticUi(instruction,result,type="",progress=0){
  $("#imuDiagnosticInstruction").textContent=instruction;
  const out=$("#imuDiagnosticResult");out.textContent=result;out.className=`diagnostic-result ${type}`;
  $("#imuDiagnosticProgress").style.width=`${Math.max(0,Math.min(100,progress))}%`;
}
function cancelImuDiagnostic(message="Verifica annullata."){
  clearInterval(imuDiagnostic.timer);imuDiagnostic.timer=null;imuDiagnostic.running=false;
  $("#startImuDiagnosticButton").disabled=!state.connected;$("#cancelImuDiagnosticButton").disabled=true;
  diagnosticUi("Registra posizioni guidate fino a ±180° e crea un file completo dell’orientamento 3D.",message,"warn",0);
}
function diagnosticSummary(){
  const byStage=key=>imuDiagnostic.samples.filter(s=>s.stage===key);
  const byAxis=axis=>imuDiagnostic.samples.filter(s=>s.axis===axis);
  const peak=(rows,index)=>rows.reduce((v,s)=>Math.max(v,Math.abs(s.gyro[index])),0);
  const stationary=byStage("plane_start");
  const meanNorm=stationary.length?stationary.reduce((v,s)=>v+Math.hypot(...s.accel),0)/stationary.length:0;
  const quaternionNormErrors=imuDiagnostic.samples.map(s=>Math.abs(1-Math.hypot(...s.quaternion)));
  const checks={
    accelNorm:Number(meanNorm.toFixed(4)),
    rollPeakDps:Number(peak(byAxis("roll"),0).toFixed(3)),
    pitchPeakDps:Number(peak(byAxis("pitch"),1).toFixed(3)),
    yawPeakDps:Number(peak(byAxis("yaw"),2).toFixed(3)),
    maxQuaternionNormError:Number(Math.max(0,...quaternionNormErrors).toFixed(8)),
    finalAttitude:imuDiagnostic.samples.at(-1)?.attitude||null
  };
  checks.sensorActive=checks.rollPeakDps>5||checks.pitchPeakDps>5||checks.yawPeakDps>5;
  checks.accelerometerPlausible=checks.accelNorm>.75&&checks.accelNorm<1.25;
  checks.axesResponsive={roll:checks.rollPeakDps>5,pitch:checks.pitchPeakDps>5,yaw:checks.yawPeakDps>5};
  return checks;
}
function finishImuDiagnostic(){
  clearInterval(imuDiagnostic.timer);imuDiagnostic.timer=null;imuDiagnostic.running=false;
  const summary=diagnosticSummary();
  imuDiagnostic.file={format:"FlightCode-IMU-Diagnostic",version:2,created:new Date().toISOString(),
    board:"MAMBAF411",alignment:["boardRoll","boardPitch","boardYaw"].map(id=>Number($(`#${id}`).value)),
    gravityReference:state.gravityReference?[...state.gravityReference]:null,
    procedure:imuDiagnostic.stages.map(({key,axis,target,ms,text})=>({key,axis,target,ms,text})),
    summary,sampleRateHz:100,samples:imuDiagnostic.samples};
  $("#startImuDiagnosticButton").disabled=!state.connected;$("#cancelImuDiagnosticButton").disabled=true;
  $("#downloadImuDiagnosticButton").disabled=false;
  const ok=summary.sensorActive&&summary.accelerometerPlausible&&Object.values(summary.axesResponsive).every(Boolean);
  diagnosticUi("Verifica completata. Scarica il file e passalo a Codex.",
    ok?"Tutti gli assi hanno risposto e la gravità è plausibile.":"Rilevata un’anomalia: il file contiene i dati necessari per individuarla.",
    ok?"ok":"warn",100);
}
function advanceImuDiagnostic(){
  imuDiagnostic.stage++;
  if(imuDiagnostic.stage>=imuDiagnostic.stages.length){finishImuDiagnostic();return}
  imuDiagnostic.stageStarted=performance.now();
}
function startImuDiagnostic(){
  if(!state.connected||state.armed||state.motorTest||pidDiagnostic.running){toast("Disarma il quad e termina gli altri test");return}
  resetAttitude();
  imuDiagnostic.running=true;imuDiagnostic.stage=0;imuDiagnostic.stageStarted=performance.now();imuDiagnostic.samples=[];imuDiagnostic.file=null;
  $("#startImuDiagnosticButton").disabled=true;$("#cancelImuDiagnosticButton").disabled=false;$("#downloadImuDiagnosticButton").disabled=true;
  imuDiagnostic.timer=setInterval(()=>{
    if(!imuDiagnostic.running)return;
    const stage=imuDiagnostic.stages[imuDiagnostic.stage],elapsed=performance.now()-imuDiagnostic.stageStarted;
    const totalBefore=imuDiagnostic.stages.slice(0,imuDiagnostic.stage).reduce((v,s)=>v+s.ms,0);
    const total=imuDiagnostic.stages.reduce((v,s)=>v+s.ms,0);
    diagnosticUi(stage.text,`Fase ${imuDiagnostic.stage+1} di ${imuDiagnostic.stages.length} · ${Math.max(0,(stage.ms-elapsed)/1000).toFixed(1)} s`,"",100*(totalBefore+Math.min(elapsed,stage.ms))/total);
    if(elapsed>=stage.ms)advanceImuDiagnostic();
  },50);
}
function recordImuDiagnostic(timestamp,gyro,accel){
  if(!imuDiagnostic.running)return;
  const stage=imuDiagnostic.stages[imuDiagnostic.stage];
  imuDiagnostic.samples.push({stage:stage.key,axis:stage.axis,target:stage.target,
    timestampUs:timestamp,gyro,accel,quaternion:[...state.q],
    attitude:{...state.angle},gravityReference:state.gravityReference?[...state.gravityReference]:null,
    renderMatrix:quaternionRenderMatrix(state.q)});
}
function downloadImuDiagnostic(){
  if(!imuDiagnostic.file)return;
  const blob=new Blob([JSON.stringify(imuDiagnostic.file,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`FlightCode-IMU-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function pidDiagnosticUi(instruction,result,type="",progress=0){
  $("#pidDiagnosticInstruction").textContent=instruction;
  const out=$("#pidDiagnosticResult");out.textContent=result;out.className=`diagnostic-result ${type}`;
  $("#pidDiagnosticProgress").style.width=`${Math.max(0,Math.min(100,progress))}%`;
}
function cancelPidDiagnostic(message="Verifica PID annullata."){
  clearInterval(pidDiagnostic.timer);pidDiagnostic.timer=null;
  if(pidDiagnostic.running&&state.armed&&state.connected){
    pidDiagnostic.aborted=true;pidDiagnostic.abortMessage=message;pidDiagnostic.stage=pidDiagnostic.stages.length;
    pidDiagnosticUi("Riporta throttle a zero e abbassa CH6.","Uscite fisiche ancora bloccate: disarma per terminare.","warn",100);
    return;
  }
  if(pidDiagnostic.running)send("PID_SIM_ENABLE 0",false);
  pidDiagnostic.running=false;
  $("#cancelPidDiagnosticButton").disabled=true;
  $("#startPidDiagnosticButton").disabled=!state.connected||!$("#pidDiagnosticSafety").checked;
  pidDiagnosticUi("Controlla che il PID contrasti correttamente i movimenti sui tre assi.",message,"warn",0);
}
function correlation(rows,axis,mix){
  if(rows.length<2)return 0;
  const av=rows.reduce((v,s)=>v+s.gyro[axis],0)/rows.length,bv=rows.reduce((v,s)=>v+mix(s.motors),0)/rows.length;
  let n=0,da=0,db=0;for(const s of rows){const a=s.gyro[axis]-av,b=mix(s.motors)-bv;n+=a*b;da+=a*a;db+=b*b}
  return da>0&&db>0?n/Math.sqrt(da*db):0;
}
function finishPidDiagnostic(){
  clearInterval(pidDiagnostic.timer);pidDiagnostic.timer=null;pidDiagnostic.running=false;
  const stage=k=>pidDiagnostic.samples.filter(s=>s.stage===k);
  const mixes=[
    m=>(-m[0]-m[1]+m[2]+m[3])/4,
    m=>(m[0]-m[1]+m[2]-m[3])/4,
    m=>(-m[0]+m[1]+m[2]-m[3])/4
  ];
  const direction=$("#motorDirection").value;
  const correlations={
    roll:Number(correlation(stage("feedbackRoll"),0,mixes[0]).toFixed(3)),
    pitch:Number(correlation(stage("feedbackPitch"),1,mixes[1]).toFixed(3)),
    yaw:Number(correlation(stage("feedbackYaw"),2,mixes[2]).toFixed(3))
  };
  const expected={roll:correlations.roll<-.2,pitch:correlations.pitch<-.2,
    yaw:direction==="REVERSED"?correlations.yaw>.2:correlations.yaw<-.2};
  const maxSpread=Math.max(0,...pidDiagnostic.samples.map(s=>Math.max(...s.motors)-Math.min(...s.motors)));
  const commandPeak={
    throttleAverage:Number(Math.max(0,...stage("throttle50").map(s=>s.motors.reduce((a,b)=>a+b,0)/4)).toFixed(2)),
    roll:Number(Math.max(0,...stage("commandRoll").map(s=>mixes[0](s.motors))).toFixed(2)),
    pitch:Number(Math.max(0,...stage("commandPitch").map(s=>mixes[1](s.motors))).toFixed(2)),
    yaw:Number(Math.max(0,...stage("commandYaw").map(s=>Math.abs(mixes[2](s.motors)))).toFixed(2))
  };
  const summary={correlations,expectedOpposition:expected,commandPeak,maxMotorSpreadPercent:Number(maxSpread.toFixed(2)),
    loopHz:Number($("#loopFrequency").textContent.replace(/\./g,"").replace(",",".")),
    maxLoopPeriodUs:Number($("#loopMaxPeriod").textContent)};
  pidDiagnostic.file={format:"FlightCode-PID-Mixer-Diagnostic",version:1,created:new Date().toISOString(),
    board:"MAMBAF411",alignment:["boardRoll","boardPitch","boardYaw"].map(id=>Number($(`#${id}`).value)),
    motorDirection:direction,rates:getRates(),feedforward:getFeedforward(),
    summary,sampleRateHz:100,samples:pidDiagnostic.samples};
  $("#cancelPidDiagnosticButton").disabled=true;$("#startPidDiagnosticButton").disabled=!state.connected||!$("#pidDiagnosticSafety").checked;
  $("#downloadPidDiagnosticButton").disabled=false;
  const ok=Object.values(expected).every(Boolean)&&maxSpread>1;
  pidDiagnosticUi("Simulazione terminata: le uscite fisiche sono rimaste sempre a zero.",
    ok?"Le tre reazioni PID hanno il segno atteso.":"Una o più reazioni richiedono verifica nel file.",
    ok?"ok":"warn",100);
}
async function startPidDiagnostic(){
  if(!state.connected||state.armed||state.motorTest||imuDiagnostic.running||!$("#pidDiagnosticSafety").checked){
    toast("Disarma il quad, termina gli altri test e conferma la rimozione delle eliche");return;
  }
  await send("PID_SIM_ENABLE 1");
  pidDiagnostic.running=true;pidDiagnostic.stage=-1;pidDiagnostic.samples=[];pidDiagnostic.file=null;pidDiagnostic.aborted=false;pidDiagnostic.abortMessage="";pidDiagnostic.detected=false;pidDiagnostic.neutralSince=0;
  $("#startPidDiagnosticButton").disabled=true;$("#cancelPidDiagnosticButton").disabled=false;$("#downloadPidDiagnosticButton").disabled=true;
  pidDiagnosticUi("Throttle a zero, poi arma con CH6.","In attesa dell’armamento…","",0);
}
function beginPidStage(index){
  pidDiagnostic.stage=index;pidDiagnostic.detected=false;pidDiagnostic.neutralSince=0;pidDiagnostic.stageStarted=performance.now();
  if(index>=pidDiagnostic.stages.length){
    pidDiagnosticUi("Riporta tutti gli stick al centro, throttle a zero e abbassa CH6.","In attesa del disarmo per chiudere la simulazione…","",100);
    return;
  }
  if(index>0)send("PID_SIM_RESET",false);
  pidDiagnosticUi(pidDiagnostic.stages[index].text,
    `Fase ${index+1} di ${pidDiagnostic.stages.length} · in attesa del movimento`,"",
    100*index/pidDiagnostic.stages.length);
}
function updatePidStage(gyro,channelValues){
  const now=performance.now(),key=pidDiagnostic.stages[pidDiagnostic.stage].key;
  if(key==="stabile"){
    if(Math.hypot(...gyro)<5){
      if(now-pidDiagnostic.stageStarted>=2000)beginPidStage(pidDiagnostic.stage+1);
    }else pidDiagnostic.stageStarted=now;
    return;
  }
  const axis=key==="feedbackRoll"?0:key==="feedbackPitch"?1:key==="feedbackYaw"?2:-1;
  const commandChannel=key==="throttle50"?0:key==="commandRoll"?1:key==="commandPitch"?2:key==="commandYaw"?3:-1;
  const active=axis>=0?Math.abs(gyro[axis])>30:
    key==="throttle50"?(channelValues[0]>=1400&&channelValues[0]<=1600):channelValues[commandChannel]>1800;
  const neutral=axis>=0?Math.abs(gyro[axis])<5:
    key==="throttle50"?channelValues[0]<1100:Math.abs(channelValues[commandChannel]-1500)<80;
  if(!pidDiagnostic.detected&&active){
    pidDiagnostic.detected=true;pidDiagnostic.neutralSince=0;
    const back=axis>=0?"Ora riporta il quad fermo.":key==="throttle50"?"Ora riporta il throttle a zero.":"Ora ricentra lo stick.";
    pidDiagnosticUi(back,`Fase ${pidDiagnostic.stage+1}: movimento rilevato`,"ok",
      100*(pidDiagnostic.stage+.55)/pidDiagnostic.stages.length);
  }
  if(pidDiagnostic.detected){
    if(neutral){
      if(pidDiagnostic.neutralSince===0)pidDiagnostic.neutralSince=now;
      if(now-pidDiagnostic.neutralSince>=500)beginPidStage(pidDiagnostic.stage+1);
    }else pidDiagnostic.neutralSince=0;
  }
}
function recordPidDiagnostic(timestamp,signal,armed,gyro,accel,channelValues,motorValues){
  if(!pidDiagnostic.running)return;
  if(!signal){cancelPidDiagnostic("Ricevente persa: verifica interrotta.");return}
  if(pidDiagnostic.stage<0){
    if(armed)beginPidStage(0);
    return;
  }
  if(pidDiagnostic.stage>=pidDiagnostic.stages.length){
    if(!armed){
      send("PID_SIM_ENABLE 0",false);
      if(pidDiagnostic.aborted)cancelPidDiagnostic(pidDiagnostic.abortMessage);
      else finishPidDiagnostic();
    }
    return;
  }
  if(!armed){cancelPidDiagnostic("Quad disarmato prima della fine: verifica interrotta.");return}
  pidDiagnostic.samples.push({stage:pidDiagnostic.stages[pidDiagnostic.stage].key,timestampUs:timestamp,gyro,accel,motors:motorValues,channels:channelValues.slice(0,6)});
  updatePidStage(gyro,channelValues);
}
function downloadPidDiagnostic(){
  if(!pidDiagnostic.file)return;
  const blob=new Blob([JSON.stringify(pidDiagnostic.file,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`FlightCode-PID-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function updateFlightLogUi(){
  const status=$("#flightLogStatus");
  if(flightLog.recording)status.textContent="Registrazione in corso: disarma prima di scaricare.";
  else if(flightLog.count)status.textContent=`${flightLog.count} campioni disponibili · ${(flightLog.count/flightLog.rate).toFixed(1)} secondi · ${flightLog.rate} Hz`;
  else status.textContent="Nessun log disponibile.";
  $("#downloadFlightLogButton").disabled=!state.connected||flightLog.recording||flightLog.count===0||flightLog.downloading;
}
function startFlightLogDownload(){
  if(!state.connected||flightLog.recording||!flightLog.count)return;
  flightLog.downloading=true;flightLog.records=[];$("#downloadFlightLogButton").disabled=true;
  $("#flightLogStatus").textContent="Download del log in corso…";
  $("#flightLogProgress").style.width="0%";
  send("GET_FLIGHT_LOG_CHUNK 0 8",false);
}
function finishFlightLogDownload(){
  flightLog.downloading=false;
  const last=flightLog.records.at(-1);
  const file={format:"FlightCode-Flight-Log",version:1,created:new Date().toISOString(),
    board:"MAMBAF411",sampleRateHz:flightLog.rate,
    alignment:["boardRoll","boardPitch","boardYaw"].map(id=>Number($(`#${id}`).value)),
    motorDirection:$("#motorDirection").value,rates:getRates(),
    feedforward:getFeedforward(),
    pids:getPids(),tpa:getTpa(),stopReason:last?.stopReason||"UNKNOWN",
    receiverDiagnostics:flightLog.receiverDiagnostics,
    samples:flightLog.records};
  const blob=new Blob([JSON.stringify(file)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`FlightCode-FLIGHT-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $("#flightLogProgress").style.width="100%";updateFlightLogUi();toast("Log di volo scaricato");
}
function telemetry(parts){
  if(parts.length<32)return;const timestamp=Number(parts[2]),signal=parts[3]==="1",armed=parts[4]==="1";
  const calibrated=parts[32]==="1";
  const wasArmed=state.armed;
  state.armed=armed;updateDfuButton();
  if(wasArmed&&!armed)setTimeout(()=>send("GET_FLIGHT_LOG_INFO",false),100);
  if(calibrated&&!state.calibrated){
    resetAttitude();toast("Calibrazione gyro completata");
  }
  state.calibrated=calibrated;
  $("#loopFrequency").textContent=Math.round(Number(parts[5])).toLocaleString("it-IT");
  $("#loopMaxPeriod").textContent=parts.length>33?Math.round(Number(parts[33])):"—";
  $("#gyroPitchRaw").textContent=parts.length>34?`GREZZO: ${Number(parts[34]).toFixed(1)}`:"GREZZO: —";
  const gyro=parts.slice(6,9).map(Number),accel=parts.slice(9,12).map(Number);
  const channelValues=parts.slice(12,28).map(Number),motorValues=parts.slice(28,32).map(Number);
  attitude(timestamp,gyro,accel);recordImuDiagnostic(timestamp,gyro,accel);
  recordPidDiagnostic(timestamp,signal,armed,gyro,accel,channelValues,motorValues);
  channels(channelValues);motors(motorValues);
  badge($("#receiverState"),signal?"SIGNAL OK":"NO SIGNAL",signal?"online":"");
  badge($("#flightState"),armed?"ARMED":calibrated?"DISARMED":"CALIBRAZIONE",armed?"armed":calibrated?"online":"");
}
function setPids(values){let i=0;axes.forEach(([key])=>terms.forEach(term=>$(`#${key}${term}`).value=Number(values[i++]).toFixed(4)))}
function getPids(){return axes.flatMap(([key,label])=>terms.map(term=>{const value=Number($(`#${key}${term}`).value);if(!Number.isFinite(value)||value<0||value>1000)throw new Error(`Valore ${label} ${term} non valido`);return value}))}
function setRates(values){["rollRate","pitchRate","yawRate"].forEach((id,i)=>$(`#${id}`).value=Number(values[i]).toFixed(0));$("#rateExpo").value=Number(values[3]).toFixed(2)}
function getRates(){
  const values=["rollRate","pitchRate","yawRate","rateExpo"].map(id=>Number($(`#${id}`).value));
  if(values.slice(0,3).some(v=>!Number.isFinite(v)||v<100||v>1200))throw new Error("I rate devono essere tra 100 e 1200 °/s");
  if(!Number.isFinite(values[3])||values[3]<0||values[3]>0.9)throw new Error("Expo deve essere tra 0 e 0,9");
  return {roll:values[0],pitch:values[1],yaw:values[2],expo:values[3]};
}
function ratesCommand(){const r=getRates();return `SET_RATES ${r.roll} ${r.pitch} ${r.yaw} ${r.expo}`}
function setFeedforward(values){axes.forEach(([key],i)=>$(`#${key}FF`).value=Number(values[i]).toFixed(3))}
function getFeedforward(){
  const values=axes.map(([key])=>Number($(`#${key}FF`).value));
  if(values.some(v=>!Number.isFinite(v)||v<0||v>1))throw new Error("Feedforward deve essere tra 0 e 1");
  return {roll:values[0],pitch:values[1],yaw:values[2]};
}
function feedforwardCommand(){const f=getFeedforward();return `SET_FEEDFORWARD ${f.roll} ${f.pitch} ${f.yaw}`}
function setTpa(values){$("#tpaAttenuation").value=Number(values[0]).toFixed(0);$("#tpaBreakpoint").value=Number(values[1]).toFixed(0)}
function getTpa(){
  const attenuation=Number($("#tpaAttenuation").value),breakpoint=Number($("#tpaBreakpoint").value);
  if(!Number.isFinite(attenuation)||attenuation<0||attenuation>100||!Number.isFinite(breakpoint)||breakpoint<0||breakpoint>100)throw new Error("TPA e soglia devono essere tra 0% e 100%");
  return {attenuation,breakpoint};
}
function tpaCommand(){const t=getTpa();return `SET_TPA ${t.attenuation/100} ${t.breakpoint}`}
function setActiveTuningProfile(name){
  document.querySelectorAll("[data-tuning-profile]").forEach(button=>button.classList.toggle("active",button.dataset.tuningProfile===name));
  $("#activeTuningProfile").textContent=name&&tuningProfiles[name]?tuningProfiles[name].label:"PERSONALIZZATO";
}
function applyTuningProfile(name){
  const profile=tuningProfiles[name];if(!profile||!state.connected)return;
  setPids(profile.pids);$("#rateExpo").value=profile.expo.toFixed(2);setFeedforward(profile.ff);setTpa(profile.tpa);
  setActiveTuningProfile(name);saveState("Preset da applicare","dirty");
  toast(`Profilo ${profile.label} caricato: premi Applica o Salva`);
}
document.querySelectorAll("[data-tuning-profile]").forEach(button=>button.onclick=()=>applyTuningProfile(button.dataset.tuningProfile));
document.querySelectorAll("[data-pid],[data-rate],[data-feedforward],[data-tpa]").forEach(input=>input.addEventListener("input",()=>setActiveTuningProfile(null)));
function setAlignment(values){$("#boardRoll").value=Number(values[0]).toFixed(1);$("#boardPitch").value=Number(values[1]).toFixed(1);$("#boardYaw").value=Number(values[2]).toFixed(1)}
function getAlignment(){return ["boardRoll","boardPitch","boardYaw"].map(id=>{const value=Number($(`#${id}`).value);if(!Number.isFinite(value)||value < -180||value > 180)throw new Error("Gli angoli devono essere compresi tra -180° e +180°");return value})}
function line(value){
  log(value);if(!value.startsWith("@CFG "))return;const p=value.trim().split(/\s+/);
  if(p[1]==="TELEMETRY"){telemetry(p);return}
  if(p[1]==="HELLO"){if(p[2]!=="FlightCode"){toast(`Dispositivo non riconosciuto: ${p[2]||"sconosciuto"}`);return}state.board=p[4]||"SCONOSCIUTA";$("#deviceName").textContent=`${p[2]} · ${state.board}`;$("#protocolText").textContent=`Protocollo v${p[3]||"1"}`;view("setup");toast(`${state.board} rilevata`);send("GET_FLIGHT_LOG_INFO",false);return}
  if(p[1]==="FLIGHT_LOG_INFO"){
    flightLog.count=Number(p[2])||0;flightLog.rate=Number(p[3])||200;flightLog.recording=p[4]==="1";
    flightLog.receiverDiagnostics=p.length>=10?{
      lossReason:["NONE","FAILSAFE","TIMEOUT"][Number(p[5])]||"UNKNOWN",
      frameAgeMs:Number(p[6]),validFrames:Number(p[7]),
      uartErrors:Number(p[8]),recoveries:Number(p[9])}:null;
    updateFlightLogUi();return;
  }
  if(p[1]==="FLIGHT_LOG"&&flightLog.downloading&&p.length>=19){
    const n=p.slice(3).map(Number),index=Number(p[2]);
    const flags=n[14],stopReason=(flags&8)!==0?"IMU_FAILURE":
      (flags&16)!==0?"SBUS_FAILSAFE":(flags&32)!==0?"SBUS_TIMEOUT":
      (flags&4)!==0?"RX_LOSS":(flags&2)!==0?"DISARM":null;
    flightLog.records.push({t:Number((index/flightLog.rate).toFixed(5)),
      gyro:n.slice(0,3).map(v=>v/10),setpoint:n.slice(3,6).map(v=>v/10),
      pid:n.slice(6,9).map(v=>v/2),motors:n.slice(9,13).map(v=>Number((v*100/255).toFixed(2))),
      throttle:n[13]/2,mixerSaturated:(flags&1)!==0,stopReason,loopUs:n[15]});return;
  }
  if(p[1]==="FLIGHT_LOG_CHUNK_END"&&flightLog.downloading){
    const next=Number(p[2]);
    $("#flightLogProgress").style.width=`${100*Math.min(next,flightLog.count)/flightLog.count}%`;
    if(next<flightLog.count)send(`GET_FLIGHT_LOG_CHUNK ${next} 8`,false);else finishFlightLogDownload();
    return;
  }
  if(p[1]==="PIDS"&&p.length>=12){setPids(p.slice(2,11));setActiveTuningProfile(null);saveState(p[11]==="1"?"Salvato nella flash":"Modifiche non salvate",p[11]==="1"?"saved":"dirty");return}
  if(p[1]==="RATES"&&p.length>=7){setRates(p.slice(2,6));saveState(p[6]==="1"?"Salvato nella flash":"Modifiche non salvate",p[6]==="1"?"saved":"dirty");return}
  if(p[1]==="FEEDFORWARD"&&p.length>=6){setFeedforward(p.slice(2,5));saveState(p[5]==="1"?"Salvato nella flash":"Modifiche non salvate",p[5]==="1"?"saved":"dirty");return}
  if(p[1]==="TPA"&&p.length>=5){setTpa([Number(p[2])*100,Number(p[3])]);saveState(p[4]==="1"?"Salvato nella flash":"Modifiche non salvate",p[4]==="1"?"saved":"dirty");return}
  if(p[1]==="BOARD_ALIGNMENT"&&p.length>=6){setAlignment(p.slice(2,5));saveState(p[5]==="1"?"Salvato nella flash":"Modifiche non salvate",p[5]==="1"?"saved":"dirty");return}
  if(p[1]==="MOTOR_PROTOCOL"){if(["MULTISHOT","ONESHOT125","DSHOT300"].includes(p[2]))$("#motorProtocol").value=p[2];return}
  if(p[1]==="MOTOR_DIRECTION"){if(["NORMAL","REVERSED"].includes(p[2]))$("#motorDirection").value=p[2];return}
  if(p[1]==="MOTOR_IDLE"){const value=Number(p[2]);if(Number.isFinite(value))$("#motorIdlePercent").value=value.toFixed(1);return}
  if(p[1]==="OK"){
    if(p[2]==="MOTOR_TEST_ENABLED"){
      state.motorTest=true;setMotorControls(true);clearInterval(state.motorHeartbeat);
      sendMotorTest();state.motorHeartbeat=setInterval(sendMotorTest,100);
      toast("Test motori abilitato");
    }else if(p[2]==="MOTOR_TEST_DISABLED"){
      resetMotorTestUi();toast("Test motori disabilitato");
    }else toast(p[2]==="ENTER_DFU"?"Avvio modalità DFU…":p[2]==="SAVE_PIDS"?"PID salvati nella flash":p[2]==="SET_PIDS"?"PID applicati":"Valori ripristinati");
  }
  if(p[1]==="ERROR"){
    if(p[2]==="ARMED"||p[2]==="ARM_SWITCH"){resetMotorTestUi();toast("Abbassa CH6: il test motori richiede il quad disarmato")}
    else if(p[2]==="MOTOR_TEST_DISABLED"){resetMotorTestUi();toast("Test motori interrotto: abilitalo nuovamente")}
    else toast(`Errore scheda: ${p.slice(2).join(" ")}`);
  }
}
async function readLoop(){
  const decoder=new TextDecoder();
  try{while(state.connected&&state.port?.readable){state.reader=state.port.readable.getReader();try{while(state.connected){const{value,done}=await state.reader.read();if(done)break;state.buffer+=decoder.decode(value,{stream:true});const lines=state.buffer.split(/\r?\n/);state.buffer=lines.pop()||"";lines.filter(Boolean).forEach(line)}}finally{state.reader.releaseLock();state.reader=null}}}
  catch(error){if(state.connected&&!state.closing){log(`Connessione terminata: ${error.message}`,"SYS");await disconnect()}}
}
async function connect(){
  if(!("serial"in navigator)){toast("Usa Chrome o Edge: Web Serial non è disponibile");return}
  try{state.port=await navigator.serial.requestPort({filters:[{usbVendorId:0x0483,usbProductId:0x5740}]});await state.port.open({baudRate:115200});state.writer=state.port.writable.getWriter();connected(true);state.task=readLoop();state.heartbeat=setInterval(()=>send("PING",false),1000);await send("HELLO")}
  catch(error){toast(error.name==="NotFoundError"?"Connessione annullata":error.message)}
}
async function disconnect(){
  if(state.closing)return;state.closing=true;
  try{clearInterval(state.heartbeat);clearInterval(state.motorHeartbeat);if(state.writer&&state.motorTest)await send("MOTOR_TEST_ENABLE 0",false);if(state.writer)await send("BYE",false);state.connected=false;if(state.reader)await state.reader.cancel();if(state.task)await state.task;if(state.writer)state.writer.releaseLock();if(state.port)await state.port.close()}
  catch(error){log(`Chiusura porta: ${error.message}`,"SYS")}
  finally{Object.assign(state,{port:null,reader:null,writer:null,task:null,buffer:"",heartbeat:null,motorHeartbeat:null,motorTest:false,lastUs:null,calibrated:false,closing:false});connected(false)}
}
buttons.connect.onclick=()=>state.connected?disconnect():connect();
buttons.read.onclick=async()=>{await send("GET_PIDS");await send("GET_RATES");await send("GET_FEEDFORWARD");await send("GET_TPA")};
buttons.apply.onclick=async()=>{try{await send(`SET_PIDS ${getPids().join(" ")}`);await send(ratesCommand());await send(feedforwardCommand());await send(tpaCommand())}catch(error){toast(error.message)}};
buttons.save.onclick=async()=>{try{await send(`SET_PIDS ${getPids().join(" ")}`);await send(ratesCommand());await send(feedforwardCommand());await send(tpaCommand());await send("SAVE_SETTINGS")}catch(error){toast(error.message)}};
buttons.reset.onclick=()=>send("RESET_PIDS");
buttons.applyProtocol.onclick=async()=>{await send(`SET_MOTOR_PROTOCOL ${$("#motorProtocol").value}`);await send("SAVE_PIDS")};
buttons.applyMotorDirection.onclick=async()=>{await send(`SET_MOTOR_DIRECTION ${$("#motorDirection").value}`);await send("SAVE_SETTINGS")};
buttons.applyMotorIdle.onclick=async()=>{
  const value=Number($("#motorIdlePercent").value);
  if(!Number.isFinite(value)||value<1||value>10){toast("Idle motori: inserisci un valore tra 1% e 10%");return}
  await send(`SET_MOTOR_IDLE ${value}`);await send("SAVE_SETTINGS");
};
buttons.applyAlignment.onclick=async()=>{try{await send(`SET_BOARD_ALIGNMENT ${getAlignment().join(" ")}`);resetAttitude()}catch(error){toast(error.message)}};
buttons.saveAlignment.onclick=async()=>{try{await send(`SET_BOARD_ALIGNMENT ${getAlignment().join(" ")}`);await send("SAVE_SETTINGS");resetAttitude()}catch(error){toast(error.message)}};
$("#resetAttitudeButton").onclick=resetAttitude;
$("#calibrateGyroButton").onclick=async()=>{
  if(state.armed){toast("Disarma il quad prima della calibrazione");return}
  if(!confirm("Appoggia il quad immobile e in piano. Avviare la calibrazione gyro?"))return;
  await send("CALIBRATE_GYRO");toast("Calibrazione: non muovere il quad");
};
$("#startImuDiagnosticButton").onclick=startImuDiagnostic;
$("#cancelImuDiagnosticButton").onclick=()=>cancelImuDiagnostic();
$("#downloadImuDiagnosticButton").onclick=downloadImuDiagnostic;
$("#pidDiagnosticSafety").onchange=event=>{
  $("#startPidDiagnosticButton").disabled=!state.connected||!event.target.checked||pidDiagnostic.running;
};
$("#startPidDiagnosticButton").onclick=startPidDiagnostic;
$("#cancelPidDiagnosticButton").onclick=()=>cancelPidDiagnostic();
$("#downloadPidDiagnosticButton").onclick=downloadPidDiagnostic;
$("#refreshFlightLogButton").onclick=()=>send("GET_FLIGHT_LOG_INFO");
$("#downloadFlightLogButton").onclick=startFlightLogDownload;
$("#enterDfuButton").onclick=async()=>{
  if(!confirm("Riavviare la scheda in modalità DFU? La connessione seriale verrà chiusa."))return;
  $("#enterDfuButton").disabled=true;
  await send("ENTER_DFU");
};
document.querySelectorAll("[data-pid]").forEach(input=>input.oninput=()=>saveState("Modifiche locali","dirty"));
document.querySelectorAll("[data-rate]").forEach(input=>input.oninput=()=>saveState("Modifiche locali","dirty"));
document.querySelectorAll("[data-feedforward]").forEach(input=>input.oninput=()=>saveState("Modifiche locali","dirty"));
document.querySelectorAll("[data-alignment]").forEach(input=>input.oninput=()=>saveState("Modifiche locali","dirty"));
navigator.serial?.addEventListener("disconnect",()=>disconnect());connected(false);

function motorTestValues(){return [0,1,2,3].map(i=>Number($(`#motorTestSlider${i}`).value))}
async function sendMotorTest(){if(state.motorTest)await send(`MOTOR_TEST ${motorTestValues().join(" ")}`,false)}
function setMotorControls(enabled){
  $("#masterMotorSlider").disabled=!enabled;
  for(let i=0;i<4;i++)$(`#motorTestSlider${i}`).disabled=!enabled;
  badge($("#motorTestState"),enabled?"ATTIVO":"BLOCCATO",enabled?"armed":"");
  updateDfuButton();
}
function resetMotorTestUi(){
  clearInterval(state.motorHeartbeat);state.motorHeartbeat=null;state.motorTest=false;
  const safety=$("#motorSafetyCheck");if(safety)safety.checked=false;
  const master=$("#masterMotorSlider");if(master){master.value=0;$("#masterMotorValue").textContent="0%"}
  for(let i=0;i<4;i++){const slider=$(`#motorTestSlider${i}`);if(slider){slider.value=0;$(`#motorTestValue${i}`).textContent="0%"}}
  setMotorControls(false);
}
$("#motorSafetyCheck").onchange=async event=>{
  if(event.target.checked){
    event.target.disabled=true;
    await send("MOTOR_TEST_ENABLE 1");
    event.target.disabled=false;
  }else{
    resetMotorTestUi();await send("MOTOR_TEST_ENABLE 0");
  }
};
$("#masterMotorSlider").oninput=event=>{
  const value=event.target.value;$("#masterMotorValue").textContent=`${value}%`;
  for(let i=0;i<4;i++){$(`#motorTestSlider${i}`).value=value;$(`#motorTestValue${i}`).textContent=`${value}%`}
  sendMotorTest();
};
for(let i=0;i<4;i++)$(`#motorTestSlider${i}`).oninput=event=>{$(`#motorTestValue${i}`).textContent=`${event.target.value}%`;sendMotorTest()};
