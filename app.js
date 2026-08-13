const axes=[["roll","ROLL"],["pitch","PITCH"],["yaw","YAW"]],terms=["P","I","D"];
let receiverConfig={protocol:"SBUS",order:"TAER1234",modes:[{fn:"ARM",channel:6,min:1950,max:2100},{fn:"BEEP",channel:5,min:1950,max:2100}]};
const state={port:null,reader:null,writer:null,task:null,connected:false,closing:false,buffer:"",heartbeat:null,motorHeartbeat:null,motorTest:false,armed:false,signal:false,telemetrySeen:false,count:0,lastUs:null,loopHz:0,maxLoopPeriodUs:0,calibrated:false,attitudeReady:false,gravityReference:[0,0,1],q:[1,0,0,0],angle:{roll:0,pitch:0,yaw:0},board:"",imuName:"",protocol:0,capabilities:new Set(),receiverProtocols:["SBUS"],receiverProtocolsReported:false,osdAvailable:false,osdPosition:"CENTER",osdDirty:false,blackboxState:"UNSUPPORTED",blackboxDirty:false};
const imuDiagnostic={running:false,stage:0,stageStarted:0,samples:[],file:null,timer:null,stages:[
  {key:"plane_start",axis:"still",target:[0,0,0],ms:3000,text:"Place the quad still and perfectly level"},
  {key:"roll_p90",axis:"roll",target:[90,0,0],ms:4000,text:"Slowly roll to +90° (right side down) and hold"},
  {key:"roll_p180",axis:"roll",target:[180,0,0],ms:4000,text:"Continue rolling to +180° (quad upside down) and hold"},
  {key:"roll_zero_1",axis:"roll",target:[0,0,0],ms:4000,text:"Return the quad to level along the same roll axis"},
  {key:"roll_n90",axis:"roll",target:[-90,0,0],ms:4000,text:"Roll to -90° (left side down) and hold"},
  {key:"roll_n180",axis:"roll",target:[-180,0,0],ms:4000,text:"Continue rolling to -180° (quad upside down) and hold"},
  {key:"roll_zero_2",axis:"roll",target:[0,0,0],ms:4000,text:"Return the quad to level again"},
  {key:"pitch_p90",axis:"pitch",target:[0,90,0],ms:4000,text:"Raise the nose to pitch +90° and hold"},
  {key:"pitch_p180",axis:"pitch",target:[0,180,0],ms:4000,text:"Continue to pitch +180° (upside down) and hold"},
  {key:"pitch_zero_1",axis:"pitch",target:[0,0,0],ms:4000,text:"Return the quad to level along the pitch axis"},
  {key:"pitch_n90",axis:"pitch",target:[0,-90,0],ms:4000,text:"Lower the nose to pitch -90° and hold"},
  {key:"pitch_n180",axis:"pitch",target:[0,-180,0],ms:4000,text:"Continue to pitch -180° (upside down) and hold"},
  {key:"pitch_zero_2",axis:"pitch",target:[0,0,0],ms:4000,text:"Return the quad to level again"},
  {key:"yaw_p90",axis:"yaw",target:[0,0,90],ms:4000,text:"Rotate the nose right to yaw +90° and hold"},
  {key:"yaw_p180",axis:"yaw",target:[0,0,180],ms:4000,text:"Continue right to yaw +180° and hold"},
  {key:"yaw_zero_1",axis:"yaw",target:[0,0,0],ms:4000,text:"Return yaw to the starting direction"},
  {key:"yaw_n90",axis:"yaw",target:[0,0,-90],ms:4000,text:"Rotate the nose left to yaw -90° and hold"},
  {key:"yaw_n180",axis:"yaw",target:[0,0,-180],ms:4000,text:"Continue left to yaw -180° and hold"},
  {key:"yaw_zero_2",axis:"yaw",target:[0,0,0],ms:4000,text:"Return yaw to the starting direction"},
  {key:"combined",axis:"combined",target:null,ms:5000,text:"Prova una posizione combinata libera su roll, pitch e yaw; non servono angoli precisi"},
  {key:"plane_end",axis:"still",target:[0,0,0],ms:3000,text:"Finish with the quad still and level"}
]};
const stationaryDiagnostic={running:false,phase:"idle",phaseStarted:0,sawCalibration:false,samples:[],file:null,
  settleMs:8000,recordMs:15000,timeoutMs:45000};
const pidDiagnostic={running:false,stage:-1,stageStarted:0,readyAt:0,samples:[],file:null,timer:null,aborted:false,abortMessage:"",detected:false,neutralSince:0,
  prepareMs:3000,neutralHoldMs:1200,stages:[
  {key:"stabile",ms:2000,text:"Keep the quad still with throttle at zero"},
  {key:"throttle50",ms:4000,text:"Raise throttle to about 50%, then return it to zero"},
  {key:"feedbackRoll",ms:4000,text:"Sticks centered: manually tilt the quad right and left"},
  {key:"feedbackPitch",ms:4000,text:"Sticks centered: manually raise and lower the nose"},
  {key:"feedbackYaw",ms:4000,text:"Sticks centered: manually rotate the nose right and left"},
  {key:"commandRoll",ms:4000,text:"Move roll right, then center the stick"},
  {key:"commandPitch",ms:4000,text:"Move pitch nose-down, then center the stick"},
  {key:"commandYaw",ms:4000,text:"Move yaw right, then center the stick"}
]};
const flightLog={count:0,rate:200,recording:false,downloading:false,records:[],receiverDiagnostics:null,blackboxDiagnostics:null};
const blackbox={flights:[],downloading:false,flight:null,records:[],expectedFlights:0,totalBytes:0,busy:false};
const tuningProfiles={
  balanced:{label:"BALANCED",pids:[.1005,.2,.0010,.1005,.2,.0008,.155,.25,0],rates:[500,500,400],expo:.35,ff:[.022,.022,.013],tpa:[20,70],filters:[90,50]},
  racing:{label:"RACING",pids:[.1005,.2,.0009,.1005,.2,.0007,.155,.25,0],rates:[420,420,350],expo:.30,ff:[.025,.025,.015],tpa:[20,70],filters:[90,50]},
  freestyle:{label:"FREESTYLE",pids:[.1005,.2,.0011,.1005,.2,.0009,.155,.25,0],rates:[650,650,500],expo:.40,ff:[.020,.020,.012],tpa:[20,65],filters:[90,50]}
};
const $=s=>document.querySelector(s);

axes.forEach(([key,label],axis)=>{
  const card=document.createElement("article");card.className="axis-card";
  card.innerHTML=`<header><b>${label}</b><small>ASSE 0${axis+1}</small></header><div class="axis-fields">${
    terms.map(term=>`<div class="pid-field"><label for="${key}${term}">${term}</label><input id="${key}${term}" data-pid type="number" min="0" max="1000" step="0.00001" value="0.00000" disabled></div>`).join("")
  }<div class="pid-field"><label for="${key}FF">FF</label><input id="${key}FF" data-feedforward type="number" min="0" max="1" step="0.001" value="0.000" disabled></div></div>`;
  $("#pidGrid").append(card);
});
for(let i=0;i<16;i++){
  const row=document.createElement("article");row.className="channel";
  row.innerHTML=`<div><b>CH${i+1}</b><small id="channelName${i}">AUX${Math.max(1,i-3)}</small></div><output id="channelValue${i}">—</output><div class="track"><i id="channelFill${i}"></i></div>`;
  $("#channelGrid").append(row);
}
for(let i=0;i<2;i++){
  const row=document.createElement("div");row.className="receiver-mode";
  row.innerHTML=`<select id="modeFunction${i}" data-receiver-config><option>ARM</option><option>BEEP</option></select><select id="modeChannel${i}" data-receiver-config>${Array.from({length:12},(_,n)=>`<option value="${n+5}">AUX${n+1} / CH${n+5}</option>`).join("")}</select><div class="range-wrap"><span id="modeRangeActive${i}" class="range-active"></span><input id="modeMin${i}" data-receiver-config type="range" min="900" max="2100" step="10"><input id="modeMax${i}" data-receiver-config type="range" min="900" max="2100" step="10"><div class="range-ruler">${[900,1100,1300,1500,1700,1900,2100].map(v=>`<span>${v}</span>`).join("")}</div></div><div class="mode-readout"><output id="modeRangeValue${i}"></output><strong id="modeLiveStatus${i}" class="mode-live-status">INACTIVE</strong><small id="modeLiveValue${i}">—</small></div>`;
  $("#receiverModes").append(row);
}
const motorPositions=["REAR RIGHT","FRONT RIGHT","REAR LEFT","FRONT LEFT"];
for(let i=0;i<4;i++){
  const row=document.createElement("div");row.className="motor-row";
  row.innerHTML=`<span title="${motorPositions[i]}">M${i+1}</span><div class="meter"><i id="motorFill${i}"></i></div><output id="motorValue${i}">0.0</output>`;
  $("#motorOutputs").append(row);
  const test=document.createElement("div");test.className="motor-test-card";
  test.innerHTML=`<div><strong>M${i+1}</strong><small>${motorPositions[i]}</small></div><input id="motorTestSlider${i}" class="vertical-motor" type="range" min="0" max="100" step="1" value="0" disabled><output id="motorTestValue${i}">0%</output>`;
  $("#motorTestGrid").append(test);
}
const buttons={connect:$("#connectButton"),read:$("#readButton"),apply:$("#applyButton"),save:$("#saveButton"),reset:$("#resetButton")};
buttons.applyProtocol=$("#applyProtocolButton");
buttons.applyMainLoop=$("#applyMainLoopButton");
buttons.applyAlignment=$("#applyAlignmentButton");buttons.saveAlignment=$("#saveAlignmentButton");
buttons.applyMotorDirection=$("#applyMotorDirectionButton");
buttons.applyMotorIdle=$("#applyMotorIdleButton");
buttons.applyReceiver=$("#applyReceiverConfigButton");buttons.saveReceiver=$("#saveReceiverConfigButton");
function updateReceiverLabels(){
  const primary=receiverConfig.order==="AETR1234"?["Roll","Pitch","Throttle","Yaw"]:["Throttle","Roll","Pitch","Yaw"];
  for(let i=0;i<16;i++)$(`#channelName${i}`).textContent=primary[i]||`AUX${i-3}`;
  receiverConfig.modes.forEach(mode=>{if(mode.channel>=5&&mode.channel<=16)$(`#channelName${mode.channel-1}`).textContent=mode.fn});
}
function updateModeRange(i){
  const minEl=$(`#modeMin${i}`),maxEl=$(`#modeMax${i}`);let min=Number(minEl.value),max=Number(maxEl.value);
  if(min>=max){if(document.activeElement===minEl)min=max-10;else max=min+10;minEl.value=min;maxEl.value=max}
  const left=(min-900)/12,width=(max-min)/12;$(`#modeRangeActive${i}`).style.cssText=`left:${left}%;width:${width}%`;$(`#modeRangeValue${i}`).textContent=`${min}–${max} µs`;
}
function setReceiverConfig(config,saved=false){
  receiverConfig=config;$("#receiverProtocol").value=config.protocol||"SBUS";$("#receiverChannelOrder").value=config.order;updateReceiverProtocolUi();
  config.modes.forEach((mode,i)=>{$(`#modeFunction${i}`).value=mode.fn;$(`#modeChannel${i}`).value=mode.channel;$(`#modeMin${i}`).value=mode.min;$(`#modeMax${i}`).value=mode.max;updateModeRange(i)});
  $("#receiverConfigState").textContent=saved?"Saved to flash":"Unsaved changes";updateReceiverLabels();
}
function getReceiverConfig(){
  const modes=[0,1].map(i=>({fn:$(`#modeFunction${i}`).value,channel:Number($(`#modeChannel${i}`).value),min:Number($(`#modeMin${i}`).value),max:Number($(`#modeMax${i}`).value)}));
  if(new Set(modes.map(m=>m.fn)).size!==2)throw new Error("Select ARM and BEEP once each");
  if(modes.some(m=>m.min>=m.max))throw new Error("Each mode needs a valid minimum and maximum");
  return {protocol:$("#receiverProtocol").value,order:$("#receiverChannelOrder").value,modes};
}
function updateReceiverProtocolUi(){const protocol=$("#receiverProtocol").value;$("#receiverInputType").textContent=`INPUT / ${protocol}`;$("#receiverDiagnosticsType").textContent=`${protocol} DIAGNOSTICS`;$("#sbusDiagnosticMessage").textContent=`Waiting for ${protocol} receiver diagnostics…`}
function setReceiverProtocols(protocols,reported=true){state.receiverProtocols=protocols.length?protocols:["SBUS"];state.receiverProtocolsReported=reported;const select=$("#receiverProtocol"),selected=state.receiverProtocols.includes(receiverConfig.protocol)?receiverConfig.protocol:state.receiverProtocols[0];select.replaceChildren(...state.receiverProtocols.map(protocol=>new Option(protocol==="ELRS"?"ELRS (CRSF)":protocol,protocol)));select.value=selected;receiverConfig.protocol=selected;updateReceiverProtocolUi()}
function receiverCommand(){const c=getReceiverConfig(),arm=c.modes.find(m=>m.fn==="ARM"),beep=c.modes.find(m=>m.fn==="BEEP"),protocol=state.receiverProtocolsReported?`${c.protocol} `:"";return `SET_RECEIVER_CONFIG ${protocol}${c.order} ${arm.channel} ${arm.min} ${arm.max} ${beep.channel} ${beep.min} ${beep.max}`}
[0,1].forEach(i=>{$(`#modeMin${i}`).oninput=()=>updateModeRange(i);$(`#modeMax${i}`).oninput=()=>updateModeRange(i)});setReceiverConfig(receiverConfig);
$("#receiverProtocol").onchange=()=>{updateReceiverProtocolUi();$("#receiverConfigState").textContent="Unsaved changes"};
function view(name){document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===`${name}View`));document.querySelectorAll(".nav").forEach(v=>v.classList.toggle("active",v.dataset.view===name))}
document.querySelectorAll(".nav").forEach(v=>v.onclick=()=>view(v.dataset.view));
function badge(el,text,type=""){el.textContent=text;el.className=`badge ${type}`}
function resetSbusDiagnostics(){
  $("#sbusDiagnostics").className="sbus-diagnostics waiting";$("#sbusHealth").textContent="WAITING";
  $("#sbusFrameAge").textContent="—";["sbusValidFrames","sbusUartErrors","sbusRecoveries","sbusOverruns","sbusInvalidFrames"].forEach(id=>$(`#${id}`).textContent="0");
  $("#sbusDiagnosticMessage").textContent="Waiting for receiver diagnostics…";
}
function updateSbusDiagnostics(valid,age,frames,errors,recoveries,overruns,invalid){
  const issues=errors+overruns+invalid,card=$("#sbusDiagnostics");
  card.className=`sbus-diagnostics${issues>0?" warning":""}`;
  $("#sbusHealth").textContent=!valid?"NO SIGNAL":issues>0?"ERRORS DETECTED":"SIGNAL CLEAN";
  $("#sbusFrameAge").textContent=age===4294967295?"NEVER":`${age} ms`;
  $("#sbusValidFrames").textContent=frames.toLocaleString();$("#sbusUartErrors").textContent=errors.toLocaleString();
  $("#sbusRecoveries").textContent=recoveries.toLocaleString();$("#sbusOverruns").textContent=overruns.toLocaleString();$("#sbusInvalidFrames").textContent=invalid.toLocaleString();
  const protocol=receiverConfig.protocol||"SBUS";$("#sbusDiagnosticMessage").textContent=!valid?`No valid ${protocol} signal.`:issues>0?`${protocol} errors detected: check signal wire, ground, connector and receiver power.`:`No ${protocol} communication errors detected since startup.`;
}
function saveState(text,type=""){const el=$("#saveState");el.textContent=text;el.className=`save-state ${type}`}
function hasCapability(name){return state.capabilities.has(name)}
function setCapabilityControls(selector,name){
  document.querySelectorAll(selector).forEach(element=>{
    element.disabled=!state.connected||!hasCapability(name);
    element.title=hasCapability(name)?"":"Feature not available on this board";
  });
}
function updateOsdControls(){
  const usable=state.connected&&hasCapability("OSD");
  $("#osdEnabled").disabled=!usable;
  document.querySelectorAll("[data-osd-position]").forEach(button=>button.disabled=!usable);
  $("#applyOsdButton").disabled=!usable;
  $("#saveOsdButton").disabled=!usable;
  $("#osdDetectionState").textContent=state.osdAvailable?"MAX7456 DETECTED":"NOT DETECTED";
}
function formatBytes(bytes){if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1048576).toFixed(1)} MB`}
function formatCardCapacity(mebibytes){
  if(!mebibytes)return {main:"—",detail:"Capacity unavailable"};
  if(mebibytes>=1024)return {main:`${(mebibytes/1024).toLocaleString(undefined,{minimumFractionDigits:1,maximumFractionDigits:1})} GiB`,detail:`${mebibytes.toLocaleString()} MiB detected`};
  return {main:`${mebibytes.toLocaleString()} MiB`,detail:hasCapability("BLACKBOX_FLASH")?"internal SPI flash":"microSD storage"};
}
function updateBlackboxControls(){
  const supported=state.connected&&hasCapability("BLACKBOX_SD"),catalogSupported=hasCapability("BLACKBOX_CATALOG"),ready=state.blackboxState==="READY"&&!blackbox.busy;
  const internalFlash=hasCapability("BLACKBOX_FLASH");
  if(internalFlash)$("#blackboxEnabled").checked=true;
  $("#blackboxEnabled").disabled=internalFlash||!supported||!ready;
  $("#refreshBlackboxButton").disabled=!supported;
  $("#applyBlackboxButton").disabled=!supported||!ready;
  $("#saveBlackboxButton").disabled=!supported||!ready;
  $("#clearBlackboxButton").disabled=!supported||!catalogSupported||!ready||state.armed||blackbox.downloading||blackbox.flights.length===0;
  $("#blackboxWriteTestButton").disabled=!supported||!internalFlash||!ready||state.armed||blackbox.downloading;
  $("#blackboxSessionTestButton").disabled=!supported||!internalFlash||!ready||state.armed||blackbox.downloading;
  document.querySelectorAll("[data-blackbox-download]").forEach(button=>button.disabled=!catalogSupported||!ready||state.armed||blackbox.downloading);
  badge($("#blackboxState"),supported?state.blackboxState:"UNAVAILABLE",ready?"online":state.blackboxState==="RECORDING"?"armed":"");
}

function stopReasonName(flags){
  return FlightCodeBlackboxLogic.stopReasonName(flags);
}

function decodeLogRecord(values,index,rate=200){
  return FlightCodeBlackboxLogic.decodeRecord(values,index,rate);
}

function renderBlackboxFlights(){
  $("#blackboxFlightCount").textContent=`${blackbox.flights.length} ${blackbox.flights.length===1?"FLIGHT":"FLIGHTS"}`;
  $("#blackboxCatalogMessage").textContent=blackbox.flights.length
    ?"Flights remain available after power cycles and can be downloaded as FlightCode JSON logs."
    :`No indexed Blackbox flights are stored on the ${hasCapability("BLACKBOX_FLASH")?"internal flash":"microSD"}.`;
  $("#blackboxFlightList").innerHTML=blackbox.flights.map(flight=>`<div class="blackbox-flight">
    <div><small>FLIGHT</small><span>#${flight.id}</span></div>
    <div><small>DURATION</small><span>${(flight.records/200).toFixed(1)} s</span></div>
    <div><small>SAMPLES</small><span>${flight.records.toLocaleString()}</span></div>
    <div><small>STOP REASON</small><span>${stopReasonName(flight.stopFlag)}</span></div>
    <button class="button secondary" data-blackbox-download="${flight.id}">Download</button>
  </div>`).join("");
  document.querySelectorAll("[data-blackbox-download]").forEach(button=>button.onclick=()=>startBlackboxDownload(Number(button.dataset.blackboxDownload)));
  updateBlackboxControls();
}

function requestBlackboxCatalog(){
  if(!state.connected||!hasCapability("BLACKBOX_CATALOG"))return;
  blackbox.flights=[];send("GET_BLACKBOX_CATALOG",false);
}

function startBlackboxDownload(flightId){
  const flight=blackbox.flights.find(item=>item.id===flightId);
  if(!flight||blackbox.downloading||state.armed)return;
  Object.assign(blackbox,{downloading:true,flight,records:[]});
  $("#blackboxDownloadProgress").style.width="0%";
  $("#blackboxDownloadState").textContent=`Downloading flight #${flight.id}…`;
  updateBlackboxControls();send(`GET_BLACKBOX_CHUNK ${flight.id} 0 4`,false);
}

function finishBlackboxDownload(){
  const flight=blackbox.flight;
  const file={format:"FlightCode-Flight-Log",version:5,source:"microSD Blackbox",flightId:flight.id,
    created:new Date().toISOString(),board:state.board||"UNKNOWN",sampleRateHz:200,
    alignment:["boardRoll","boardPitch","boardYaw"].map(id=>Number($(`#${id}`).value)),
    motorDirection:$("#motorDirection").value,rates:getRates(),feedforward:getFeedforward(),
    pids:getPids(),tpa:getTpa(),stopReason:stopReasonName(flight.stopFlag),samples:blackbox.records};
  if(hasCapability("FILTERS"))file.filters=getFilters();
  const blob=new Blob([JSON.stringify(file)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`FlightCode-BLACKBOX-${flight.id}-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  blackbox.downloading=false;blackbox.flight=null;$("#blackboxDownloadProgress").style.width="100%";
  $("#blackboxDownloadState").textContent="Download completed";updateBlackboxControls();toast("Blackbox flight downloaded");
}
function selectOsdPosition(position){
  state.osdPosition=position;
  document.querySelectorAll("[data-osd-position]").forEach(button=>button.classList.toggle("active",button.dataset.osdPosition===position));
}
function updateMotorProtocolOptions(){
  const values=state.board==="PICO2_W"
    ?[["DSHOT300","DSHOT300"],["DSHOT600","DSHOT600"],["DSHOT1200","DSHOT1200"]]
    :[["DSHOT300","DSHOT300"],["DSHOT600","DSHOT600"],["DSHOT1200","DSHOT1200"]];
  const selected=$("#motorProtocol").value;
  $("#motorProtocol").innerHTML=values.map(([value,label])=>`<option value="${value}">${label}</option>`).join("");
  if(values.some(([value])=>value===selected))$("#motorProtocol").value=selected;
}
function updateMotorDirectionDiagram(){
  const direction=$("#motorDirection").value;
  const normal=direction!=="REVERSED";
  document.querySelectorAll("[data-motor-direction]").forEach(item=>{
    const motor=Number(item.dataset.motorDirection);
    const clockwise=normal?(motor===1||motor===4):(motor===2||motor===3);
    item.querySelector("i").textContent=clockwise?"\u21bb":"\u21ba";
    item.querySelector("small").textContent=clockwise?"CW":"CCW";
    item.classList.toggle("clockwise",clockwise);
  });
  const diagram=$("#motorDirectionDiagram");
  diagram.setAttribute("aria-label",normal
    ?"Normal motor direction: M1 and M4 clockwise; M2 and M3 counterclockwise"
    :"Reversed motor direction: M1 and M4 counterclockwise; M2 and M3 clockwise");
}
$("#motorDirection").onchange=updateMotorDirectionDiagram;
updateMotorDirectionDiagram();
function applyCapabilities(){
  setCapabilityControls("[data-pid]","PIDS");
  setCapabilityControls("[data-rate]","RATES");
  setCapabilityControls("[data-feedforward]","FEEDFORWARD");
  setCapabilityControls("[data-tpa]","TPA");
  setCapabilityControls("[data-filter]","FILTERS");
  setCapabilityControls("[data-alignment],#applyAlignmentButton,#saveAlignmentButton","BOARD_ALIGNMENT");
  setCapabilityControls("#motorProtocol,#applyProtocolButton","MOTOR_PROTOCOL");
  setCapabilityControls("#mainLoopHz,#applyMainLoopButton","MAIN_LOOP");
  setCapabilityControls("#motorDirection,#applyMotorDirectionButton","MOTOR_DIRECTION");
  setCapabilityControls("#motorIdlePercent,#applyMotorIdleButton","MOTOR_IDLE");
  setCapabilityControls("[data-receiver-config],#applyReceiverConfigButton,#saveReceiverConfigButton","RECEIVER_CONFIG");
  setCapabilityControls("#motorSafetyCheck","MOTOR_TEST");
  setCapabilityControls("#startImuDiagnosticButton","TELEMETRY");
  setCapabilityControls("#startStationaryDiagnosticButton","GYRO_CALIBRATION");
  setCapabilityControls("#calibrateGyroButton","GYRO_CALIBRATION");
  setCapabilityControls("#pidDiagnosticSafety","PID_SIM");
  setCapabilityControls("#refreshFlightLogButton","FLIGHT_LOG");
  setCapabilityControls("#enterDfuButton","DFU");
  updateOsdControls();
  updateBlackboxControls();
  document.querySelectorAll("[data-tuning-profile]").forEach(element=>{
    element.disabled=!state.connected||!["PIDS","RATES","FEEDFORWARD","TPA","FILTERS"].every(hasCapability);
  });
  [buttons.read,buttons.apply,buttons.save,buttons.reset].forEach(element=>element.disabled=!state.connected||!hasCapability("PIDS"));
  $("#startPidDiagnosticButton").disabled=!state.connected||!hasCapability("PID_SIM")||!$("#pidDiagnosticSafety").checked;
  updateDfuButton();
  if(!state.connected){state.imuName="";$("#diagnosticImuName").textContent="IMU —"}
}
function updateDfuButton(){const button=$("#enterDfuButton");button.disabled=!state.connected||!hasCapability("DFU")||state.armed||state.motorTest;window.firmwareFlasher?.updateReady?.()}
function toast(text){const el=$("#toast");el.textContent=text;el.classList.add("visible");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("visible"),2400)}
function updateConnectionText(){
  $("#connectionText").textContent=!state.connected?"Board not connected":
    state.board?`FlightCode connected · ${state.board}`:"FlightCode connected";
}
function updateBattery(voltage){
  const status=$("#batteryStatus");
  if(!state.connected||!hasCapability("BATTERY_VOLTAGE")||!Number.isFinite(voltage)||voltage<1){status.className="battery-status disabled";$("#batteryVoltage").textContent="— V";$("#batteryFill").style.width="0";status.title=!state.connected?"Board not connected":"Battery voltage not available";return}
  const cells=Math.max(1,Math.min(8,Math.ceil(voltage/4.25))),cellVoltage=voltage/cells;
  const percent=Math.max(0,Math.min(100,(cellVoltage-3.3)/.9*100));
  status.className="battery-status";status.classList.toggle("warning",cellVoltage<3.55&&cellVoltage>=3.35);status.classList.toggle("critical",cellVoltage<3.35);
  $("#batteryFill").style.width=`${percent}%`;$("#batteryVoltage").textContent=`${voltage.toFixed(2)} V`;
  status.title=`${cells}S estimated · ${cellVoltage.toFixed(2)} V per cell`;
}
function connected(value){
  state.connected=value;$("#connectionDot").classList.toggle("online",value);$("#deviceDot").classList.toggle("online",value);
  updateConnectionText();buttons.connect.textContent=value?"Disconnect":"Connect";
  document.querySelectorAll("[data-pid]").forEach(i=>i.disabled=!value);[buttons.read,buttons.apply,buttons.save,buttons.reset].forEach(b=>b.disabled=!value);
  document.querySelectorAll("[data-rate]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-feedforward]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-tpa]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-filter]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-tuning-profile]").forEach(i=>i.disabled=!value);
  document.querySelectorAll("[data-alignment]").forEach(i=>i.disabled=!value);buttons.applyAlignment.disabled=!value;buttons.saveAlignment.disabled=!value;
  $("#motorProtocol").disabled=!value;buttons.applyProtocol.disabled=!value;
  $("#mainLoopHz").disabled=!value;buttons.applyMainLoop.disabled=!value;
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
  if(!value){state.osdAvailable=false;state.osdDirty=false;state.loopHz=0;state.maxLoopPeriodUs=0;$("#loopFrequency").textContent="—";$("#loopMaxPeriod").textContent="—";$("#osdEnabled").checked=false;selectOsdPosition("CENTER");$("#osdConfigState").textContent="Waiting for board settings";$("#deviceName").textContent="No device";$("#protocolText").textContent="USB serial";updateBattery(NaN);resetSbusDiagnostics();badge($("#flightState"),"OFFLINE");badge($("#receiverState"),"NO SIGNAL");saveState("Not connected");Object.assign(blackbox,{flights:[],downloading:false,flight:null,records:[],expectedFlights:0,totalBytes:0,busy:false});renderBlackboxFlights();$("#blackboxStored").textContent="—";$("#blackboxWrittenDetail").textContent="0 B written this power session";$("#blackboxDownloadState").textContent="No download in progress"}
  if(!value){resetMotorTestUi();$("#pidDiagnosticSafety").checked=false}
  if(!value&&imuDiagnostic.running)cancelImuDiagnostic("Check interrupted: board disconnected.");
  if(!value&&stationaryDiagnostic.running)cancelStationaryDiagnostic("Check interrupted: board disconnected.");
  if(!value&&pidDiagnostic.running)cancelPidDiagnostic("Check interrupted: board disconnected.");
  applyCapabilities();
}
function log(line,direction="RX"){
  if(line.includes("@CFG TELEMETRY")||line.startsWith("@CFG BATTERY_VOLTAGE")||line.startsWith("@CFG SBUS_DIAGNOSTICS")||line.startsWith("@CFG FLIGHT_LOG ")||line.startsWith("@CFG FLIGHT_LOG_CHUNK_END")||line.startsWith("@CFG BLACKBOX_LOG ")||line.startsWith("@CFG BLACKBOX_CHUNK_END")||line==="PING")return;
  const out=$("#consoleOutput");if(!state.count)out.textContent="";out.textContent+=`${new Date().toLocaleTimeString()}  ${direction}  ${line}\n`;out.scrollTop=out.scrollHeight;
  $("#messageCount").textContent=`${++state.count} messages`;
}
async function send(command,visible=true){if(!state.writer)return;if(visible)log(command,"TX");await state.writer.write(new TextEncoder().encode(`${command}\n`))}
async function enterDfuMode(){
  if(!state.connected||!hasCapability("DFU")||state.armed||state.motorTest)throw new Error("Bootloader restart requires a connected, disarmed board with motor test disabled");
  $("#enterDfuButton").disabled=true;
  await send("ENTER_DFU");
}
window.flightCodeConfigurator={
  board:()=>state.board,
  canEnterDfu:()=>state.connected&&hasCapability("DFU")&&!state.armed&&!state.motorTest&&["MAMBAF411","CLRACINGF4","FLYWOOF405NANO","PICO2_W"].includes(state.board),
  enterDfu:enterDfuMode
};
function resetAttitude(){
  FlightCodeAttitude.reset(state);window.quadRenderer?.reset();
}
function renderQuaternion(q){
  window.quadRenderer?.render(q);
}
let latestAttitudeGyro=[0,0,0],latestAttitudeAccel=[0,0,0],attitudeFramePending=false;
function renderAttitudeFrame(){
  attitudeFramePending=false;
  renderQuaternion(state.q);
  $("#loopFrequency").textContent=state.loopHz.toLocaleString("en-US");
  $("#loopMaxPeriod").textContent=state.maxLoopPeriodUs||"—";
  $("#gyroRoll").textContent=latestAttitudeGyro[0].toFixed(1);$("#gyroPitch").textContent=latestAttitudeGyro[1].toFixed(1);$("#gyroYaw").textContent=latestAttitudeGyro[2].toFixed(1);
  $("#accelX").textContent=latestAttitudeAccel[0].toFixed(2);$("#accelY").textContent=latestAttitudeAccel[1].toFixed(2);$("#accelZ").textContent=latestAttitudeAccel[2].toFixed(2);
  $("#attitudeRoll").textContent=state.angle.roll.toFixed(1);$("#attitudePitch").textContent=state.angle.pitch.toFixed(1);$("#attitudeYaw").textContent=state.angle.yaw.toFixed(1);
}
function attitude(timestamp,gyro,accel){
  FlightCodeAttitude.update(state,timestamp,gyro,accel);
  latestAttitudeGyro=[...gyro];latestAttitudeAccel=[...accel];
  if(!attitudeFramePending){attitudeFramePending=true;requestAnimationFrame(renderAttitudeFrame)}
}
let pendingChannelValues=null,channelFramePending=false;
function channels(values){pendingChannelValues=values;if(channelFramePending)return;channelFramePending=true;requestAnimationFrame(()=>{channelFramePending=false;pendingChannelValues.forEach((value,i)=>{const pct=Math.max(0,Math.min(100,(value-900)/12)),mode=receiverConfig.modes.find(m=>m.channel===i+1),active=mode&&value>=mode.min&&value<=mode.max;$(`#channelFill${i}`).style.width=`${pct}%`;$(`#channelFill${i}`).style.background=active?"var(--green)":"var(--cyan)";$(`#channelValue${i}`).textContent=`${Math.round(value)} µs`});receiverConfig.modes.forEach((mode,i)=>{const value=pendingChannelValues[mode.channel-1],active=Number.isFinite(value)&&value>=mode.min&&value<=mode.max,row=$(`#modeFunction${i}`).closest(".receiver-mode");row.classList.toggle("active",active);$(`#modeLiveStatus${i}`).textContent=active?"ACTIVE":"INACTIVE";$(`#modeLiveValue${i}`).textContent=Number.isFinite(value)?`${Math.round(value)} µs live`:"—"})})}
let pendingMotorValues=null,motorFramePending=false;
function motors(values){pendingMotorValues=values;if(motorFramePending)return;motorFramePending=true;requestAnimationFrame(()=>{motorFramePending=false;pendingMotorValues.forEach((value,i)=>{$(`#motorFill${i}`).style.width=`${Math.max(0,Math.min(100,value))}%`;$(`#motorValue${i}`).textContent=value.toFixed(1)})})}
function diagnosticUi(instruction,result,type="",progress=0){
  $("#imuDiagnosticInstruction").textContent=instruction;
  const out=$("#imuDiagnosticResult");out.textContent=result;out.className=`diagnostic-result ${type}`;
  $("#imuDiagnosticProgress").style.width=`${Math.max(0,Math.min(100,progress))}%`;
}
function cancelImuDiagnostic(message="Check cancelled."){
  clearInterval(imuDiagnostic.timer);imuDiagnostic.timer=null;imuDiagnostic.running=false;
  $("#startImuDiagnosticButton").disabled=!state.connected;$("#cancelImuDiagnosticButton").disabled=true;
  diagnosticUi("Registra posizioni guidate fino a ±180° e crea un file completo dell’orientamento 3D.",message,"warn",0);
}
function diagnosticSummary(samples=imuDiagnostic.samples){return FlightCodeDiagnosticLogic.imuSummary(samples)}
function finishImuDiagnostic(){
  clearInterval(imuDiagnostic.timer);imuDiagnostic.timer=null;imuDiagnostic.running=false;
  const summary=diagnosticSummary();
  imuDiagnostic.file={format:"FlightCode-IMU-Diagnostic",version:3,created:new Date().toISOString(),
    board:state.board||"UNKNOWN",alignment:["boardRoll","boardPitch","boardYaw"].map(id=>Number($(`#${id}`).value)),
    gravityReference:state.gravityReference?[...state.gravityReference]:null,
    procedure:imuDiagnostic.stages.map(({key,axis,target,ms,text})=>({key,axis,target,ms,text})),
    summary,sampleRateHz:100,samples:imuDiagnostic.samples};
  $("#startImuDiagnosticButton").disabled=!state.connected;$("#cancelImuDiagnosticButton").disabled=true;
  $("#downloadImuDiagnosticButton").disabled=false;
  diagnosticUi("Check completed. Download the file and send it to Codex.",
    summary.ok?"Gyroscope and accelerometer axes, signs, and directions are coherent.":"Axis, sign, or sensor-orientation anomaly detected: inspect the diagnostic file.",
    summary.ok?"ok":"warn",100);
}
function advanceImuDiagnostic(){
  imuDiagnostic.stage++;
  if(imuDiagnostic.stage>=imuDiagnostic.stages.length){finishImuDiagnostic();return}
  imuDiagnostic.stageStarted=performance.now();
}
function startImuDiagnostic(){
  if(!state.connected||state.armed||state.motorTest||pidDiagnostic.running||stationaryDiagnostic.running){toast("Disarm the quad and stop the other tests");return}
  resetAttitude();
  imuDiagnostic.running=true;imuDiagnostic.stage=0;imuDiagnostic.stageStarted=performance.now();imuDiagnostic.samples=[];imuDiagnostic.file=null;
  $("#startImuDiagnosticButton").disabled=true;$("#cancelImuDiagnosticButton").disabled=false;$("#downloadImuDiagnosticButton").disabled=true;
  imuDiagnostic.timer=setInterval(()=>{
    if(!imuDiagnostic.running)return;
    const stage=imuDiagnostic.stages[imuDiagnostic.stage],elapsed=performance.now()-imuDiagnostic.stageStarted;
    const totalBefore=imuDiagnostic.stages.slice(0,imuDiagnostic.stage).reduce((v,s)=>v+s.ms,0);
    const total=imuDiagnostic.stages.reduce((v,s)=>v+s.ms,0);
    diagnosticUi(stage.text,`Stage ${imuDiagnostic.stage+1} of ${imuDiagnostic.stages.length} · ${Math.max(0,(stage.ms-elapsed)/1000).toFixed(1)} s`,"",100*(totalBefore+Math.min(elapsed,stage.ms))/total);
    if(elapsed>=stage.ms)advanceImuDiagnostic();
  },50);
}
function recordImuDiagnostic(timestamp,gyro,accel){
  if(!imuDiagnostic.running)return;
  const stage=imuDiagnostic.stages[imuDiagnostic.stage];
  imuDiagnostic.samples.push({stage:stage.key,axis:stage.axis,target:stage.target,
    timestampUs:timestamp,gyro,accel,quaternion:[...state.q],
    attitude:{...state.angle},gravityReference:state.gravityReference?[...state.gravityReference]:null});
}
function downloadImuDiagnostic(){
  if(!imuDiagnostic.file)return;
  const blob=new Blob([JSON.stringify(imuDiagnostic.file,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`FlightCode-IMU-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function stationaryDiagnosticUi(instruction,result,type="",progress=0){
  $("#stationaryDiagnosticInstruction").textContent=instruction;
  const out=$("#stationaryDiagnosticResult");out.textContent=result;out.className=`diagnostic-result ${type}`;
  $("#stationaryDiagnosticProgress").style.width=`${Math.max(0,Math.min(100,progress))}%`;
}
function cancelStationaryDiagnostic(message="Stationary test cancelled."){
  stationaryDiagnostic.running=false;stationaryDiagnostic.phase="idle";
  $("#startStationaryDiagnosticButton").disabled=!state.connected||!hasCapability("GYRO_CALIBRATION");
  $("#cancelStationaryDiagnosticButton").disabled=true;
  stationaryDiagnosticUi("Keep the board completely still during the entire test.",message,"warn",0);
}
function vectorStats(rows,key){
  const values=axis=>rows.map(row=>row[key]?.[axis]).filter(Number.isFinite);
  const mean=items=>items.length?items.reduce((sum,value)=>sum+value,0)/items.length:0;
  const result={mean:[],standardDeviation:[],startMean:[],endMean:[],drift:[]};
  for(let axis=0;axis<3;axis++){
    const all=values(axis),average=mean(all),window=Math.max(1,Math.floor(all.length*.2));
    const start=mean(all.slice(0,window)),end=mean(all.slice(-window));
    result.mean.push(Number(average.toFixed(5)));
    result.standardDeviation.push(Number(Math.sqrt(mean(all.map(value=>(value-average)**2))).toFixed(5)));
    result.startMean.push(Number(start.toFixed(5)));result.endMean.push(Number(end.toFixed(5)));
    result.drift.push(Number((end-start).toFixed(5)));
  }
  return result;
}
function buildStationaryDiagnosticFile(status,message){
  const rows=stationaryDiagnostic.samples,recorded=rows.filter(row=>row.phase==="recording");
  const temperatures=rows.map(row=>row.temperatureC).filter(Number.isFinite);
  const meanTemperature=temperatures.length?temperatures.reduce((sum,value)=>sum+value,0)/temperatures.length:null;
  let calibrationResets=0;
  for(let i=1;i<rows.length;i++)if(rows[i].calibrationSamples<rows[i-1].calibrationSamples)calibrationResets++;
  const analysisRows=recorded.length?recorded:rows;
  const summary={status,message,correctedGyro:vectorStats(analysisRows,"gyro"),rawGyro:vectorStats(analysisRows,"rawGyro"),
    accel:vectorStats(analysisRows,"accel"),temperatureC:meanTemperature===null?null:Number(meanTemperature.toFixed(3)),
    maximumCalibrationSamples:Math.max(0,...rows.map(row=>row.calibrationSamples)),calibrationResets,
    durationSeconds:rows.length>1?Number(((rows.at(-1).timestampUs-rows[0].timestampUs)/1e6).toFixed(3)):0,
    sampleCount:rows.length,recordedSampleCount:recorded.length};
  stationaryDiagnostic.file={format:"FlightCode-Stationary-Gyro-Diagnostic",version:1,
    created:new Date().toISOString(),board:state.board||"UNKNOWN",
    alignment:["boardRoll","boardPitch","boardYaw"].map(id=>Number($(`#${id}`).value)),
    settleSeconds:stationaryDiagnostic.settleMs/1000,summary,sampleRateHz:25,samples:rows};
  return summary;
}
function failStationaryDiagnostic(message){
  stationaryDiagnostic.running=false;stationaryDiagnostic.phase="failed";
  buildStationaryDiagnosticFile("failed",message);
  $("#startStationaryDiagnosticButton").disabled=!state.connected;
  $("#cancelStationaryDiagnosticButton").disabled=true;$("#downloadStationaryDiagnosticButton").disabled=false;
  stationaryDiagnosticUi("Diagnostic stopped. Download the file to inspect calibration progress.",message,"warn",100);
}
function finishStationaryDiagnostic(){
  stationaryDiagnostic.running=false;stationaryDiagnostic.phase="complete";
  const summary=buildStationaryDiagnosticFile("complete","Calibration and stationary recording completed.");
  $("#startStationaryDiagnosticButton").disabled=!state.connected;
  $("#cancelStationaryDiagnosticButton").disabled=true;$("#downloadStationaryDiagnosticButton").disabled=false;
  const worst=Math.max(...summary.correctedGyro.mean.map(Math.abs));
  stationaryDiagnosticUi("Stationary calibration and recording completed.",
    `Residual gyro offset: ${worst.toFixed(3)} °/s. Download the diagnostic file.`,worst<=.2?"ok":"warn",100);
}
async function startStationaryDiagnostic(){
  if(!state.connected||state.armed||state.motorTest||imuDiagnostic.running||pidDiagnostic.running){
    toast("Disarm the quad and stop the other tests");return;
  }
  Object.assign(stationaryDiagnostic,{running:true,phase:"calibrating",phaseStarted:performance.now(),
    sawCalibration:false,samples:[],file:null});
  $("#startStationaryDiagnosticButton").disabled=true;$("#cancelStationaryDiagnosticButton").disabled=false;
  $("#downloadStationaryDiagnosticButton").disabled=true;
  stationaryDiagnosticUi("Do not touch the board: gyroscope calibration in progress.","Waiting for calibration…","",5);
  await send("CALIBRATE_GYRO");
}
function recordStationaryDiagnostic(timestamp,gyro,accel,rawGyro,calibrationSamples,temperatureC,calibrated){
  if(!stationaryDiagnostic.running)return;
  const now=performance.now(),elapsed=now-stationaryDiagnostic.phaseStarted;
  stationaryDiagnostic.samples.push({phase:stationaryDiagnostic.phase,timestampUs:timestamp,calibrated,
    calibrationSamples:Number.isFinite(calibrationSamples)?calibrationSamples:0,
    gyro:[...gyro],rawGyro:[...rawGyro],accel:[...accel],temperatureC:Number.isFinite(temperatureC)?temperatureC:null});
  if(stationaryDiagnostic.phase==="calibrating"){
    if(!calibrated)stationaryDiagnostic.sawCalibration=true;
    if(stationaryDiagnostic.sawCalibration&&calibrated){
      stationaryDiagnostic.phase="settling";stationaryDiagnostic.phaseStarted=now;
      stationaryDiagnosticUi("Calibration completed. Keep the board still while the bias stabilizes.","Stabilizing…","",15);
    }else if(elapsed>stationaryDiagnostic.timeoutMs)failStationaryDiagnostic("Calibration timed out. Download the diagnostic file.");
    else stationaryDiagnosticUi("Do not touch the board: gyroscope calibration in progress.",
      `Valid samples: ${calibrationSamples} / 8000`,"",5+10*Math.min(1,calibrationSamples/8000));
    return;
  }
  const gyroMagnitude=Math.hypot(...gyro),accelNorm=Math.hypot(...accel);
  if(gyroMagnitude>10||accelNorm<.6||accelNorm>1.4){
    failStationaryDiagnostic("Movement detected. Download the diagnostic file or restart the test.");return;
  }
  if(stationaryDiagnostic.phase==="settling"){
    stationaryDiagnosticUi("Calibration completed. Keep the board still while the bias stabilizes.",
      `Stabilizing: ${Math.max(0,(stationaryDiagnostic.settleMs-elapsed)/1000).toFixed(1)} s`,"",15+35*Math.min(1,elapsed/stationaryDiagnostic.settleMs));
    if(elapsed>=stationaryDiagnostic.settleMs){stationaryDiagnostic.phase="recording";stationaryDiagnostic.phaseStarted=now}
    return;
  }
  if(stationaryDiagnostic.phase==="recording"){
    stationaryDiagnosticUi("Recording gyro noise and drift. Do not touch the board.",
      `Recording: ${Math.max(0,(stationaryDiagnostic.recordMs-elapsed)/1000).toFixed(1)} s`,"",50+50*Math.min(1,elapsed/stationaryDiagnostic.recordMs));
    if(elapsed>=stationaryDiagnostic.recordMs)finishStationaryDiagnostic();
  }
}
function downloadStationaryDiagnostic(){
  if(!stationaryDiagnostic.file)return;
  const blob=new Blob([JSON.stringify(stationaryDiagnostic.file,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`FlightCode-GYRO-STATIONARY-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function pidDiagnosticUi(instruction,result,type="",progress=0){
  $("#pidDiagnosticInstruction").textContent=instruction;
  const out=$("#pidDiagnosticResult");out.textContent=result;out.className=`diagnostic-result ${type}`;
  $("#pidDiagnosticProgress").style.width=`${Math.max(0,Math.min(100,progress))}%`;
}
function cancelPidDiagnostic(message="PID check cancelled."){
  clearInterval(pidDiagnostic.timer);pidDiagnostic.timer=null;
  if(pidDiagnostic.running&&state.armed&&state.connected){
    pidDiagnostic.aborted=true;pidDiagnostic.abortMessage=message;pidDiagnostic.stage=pidDiagnostic.stages.length;
    pidDiagnosticUi("Return throttle to zero and disable the ARM switch.","Physical outputs are still locked: disarm to finish.","warn",100);
    return;
  }
  if(pidDiagnostic.running)send("PID_SIM_ENABLE 0",false);
  pidDiagnostic.running=false;
  $("#cancelPidDiagnosticButton").disabled=true;
  $("#startPidDiagnosticButton").disabled=!state.connected||!$("#pidDiagnosticSafety").checked;
  pidDiagnosticUi("Check that the PID correctly opposes movement on all three axes.",message,"warn",0);
}
function pidDiagnosticSummary(samples,direction,loopHz,maxLoopPeriodUs){
  return FlightCodeDiagnosticLogic.pidSummary(samples,direction,loopHz,maxLoopPeriodUs);
}
function finishPidDiagnostic(){
  clearInterval(pidDiagnostic.timer);pidDiagnostic.timer=null;pidDiagnostic.running=false;
  const direction=$("#motorDirection").value;
  const summary=pidDiagnosticSummary(pidDiagnostic.samples,direction,state.loopHz,state.maxLoopPeriodUs);
  pidDiagnostic.file={format:"FlightCode-PID-Mixer-Diagnostic",version:2,created:new Date().toISOString(),
    board:state.board||"UNKNOWN",alignment:["boardRoll","boardPitch","boardYaw"].map(id=>Number($(`#${id}`).value)),
    motorDirection:direction,rates:getRates(),feedforward:getFeedforward(),
    summary,sampleRateHz:100,samples:pidDiagnostic.samples};
  $("#cancelPidDiagnosticButton").disabled=true;$("#startPidDiagnosticButton").disabled=!state.connected||!$("#pidDiagnosticSafety").checked;
  $("#downloadPidDiagnosticButton").disabled=false;
  pidDiagnosticUi("Simulation completed: physical outputs remained at zero throughout.",
    summary.ok?"PID feedback and radio commands match the universal Quad X mixer.":"A feedback direction, mixer output, or radio command requires inspection.",
    summary.ok?"ok":"warn",100);
}
async function startPidDiagnostic(){
  if(!state.connected||state.armed||state.motorTest||imuDiagnostic.running||stationaryDiagnostic.running||!$("#pidDiagnosticSafety").checked){
    toast("Disarm the quad, stop the other tests, and confirm that the propellers are removed");return;
  }
  await send("PID_SIM_ENABLE 1");
  pidDiagnostic.running=true;pidDiagnostic.stage=-1;pidDiagnostic.samples=[];pidDiagnostic.file=null;pidDiagnostic.aborted=false;pidDiagnostic.abortMessage="";pidDiagnostic.detected=false;pidDiagnostic.neutralSince=0;pidDiagnostic.readyAt=0;
  $("#startPidDiagnosticButton").disabled=true;$("#cancelPidDiagnosticButton").disabled=false;$("#downloadPidDiagnosticButton").disabled=true;
  pidDiagnosticUi("Set throttle to zero, then enable the configured ARM switch.","Waiting for arming…","",0);
}
function beginPidStage(index){
  const now=performance.now();
  pidDiagnostic.stage=index;pidDiagnostic.detected=false;pidDiagnostic.neutralSince=0;pidDiagnostic.stageStarted=now;
  if(index>=pidDiagnostic.stages.length){
    pidDiagnosticUi("Center all sticks, set throttle to zero, and disable the ARM switch.","Waiting for disarm to end the simulation…","",100);
    return;
  }
  if(index>0)send("PID_SIM_RESET",false);
  pidDiagnostic.readyAt=now+pidDiagnostic.prepareMs;
  pidDiagnosticUi(pidDiagnostic.stages[index].text,
    `Stage ${index+1} of ${pidDiagnostic.stages.length} · get ready (3.0 s)`,"",
    100*index/pidDiagnostic.stages.length);
}
function updatePidStage(gyro,channelValues){
  const now=performance.now(),key=pidDiagnostic.stages[pidDiagnostic.stage].key;
  if(now<pidDiagnostic.readyAt){
    const remaining=(pidDiagnostic.readyAt-now)/1000;
    pidDiagnosticUi(pidDiagnostic.stages[pidDiagnostic.stage].text,
      `Stage ${pidDiagnostic.stage+1} of ${pidDiagnostic.stages.length} · get ready (${remaining.toFixed(1)} s)`,"",
      100*pidDiagnostic.stage/pidDiagnostic.stages.length);
    return;
  }
  if(key==="stabile"){
    if(Math.hypot(...gyro)<5){
      if(now-pidDiagnostic.readyAt>=2000)beginPidStage(pidDiagnostic.stage+1);
    }else pidDiagnostic.readyAt=now;
    return;
  }
  const axis=key==="feedbackRoll"?0:key==="feedbackPitch"?1:key==="feedbackYaw"?2:-1;
  const channelIndex=receiverChannelIndex();
  const commandChannel=key==="throttle50"?channelIndex.throttle:key==="commandRoll"?channelIndex.roll:key==="commandPitch"?channelIndex.pitch:key==="commandYaw"?channelIndex.yaw:-1;
  const active=axis>=0?Math.abs(gyro[axis])>30:
    key==="throttle50"?(channelValues[commandChannel]>=1400&&channelValues[commandChannel]<=1600):channelValues[commandChannel]>1800;
  const neutral=axis>=0?Math.abs(gyro[axis])<5:
    key==="throttle50"?channelValues[commandChannel]<1100:Math.abs(channelValues[commandChannel]-1500)<80;
  if(!pidDiagnostic.detected&&active){
    pidDiagnostic.detected=true;pidDiagnostic.neutralSince=0;
    const back=axis>=0?"Now hold the quad still.":key==="throttle50"?"Now return throttle to zero.":"Now center the stick.";
    pidDiagnosticUi(back,`Stage ${pidDiagnostic.stage+1}: movement detected`,"ok",
      100*(pidDiagnostic.stage+.55)/pidDiagnostic.stages.length);
  }
  if(pidDiagnostic.detected){
    if(neutral){
      if(pidDiagnostic.neutralSince===0)pidDiagnostic.neutralSince=now;
      if(now-pidDiagnostic.neutralSince>=pidDiagnostic.neutralHoldMs)beginPidStage(pidDiagnostic.stage+1);
    }else pidDiagnostic.neutralSince=0;
  }
}
function receiverChannelIndex(order=receiverConfig.order){
  return FlightCodeDiagnosticLogic.receiverChannelIndex(order);
}
function recordPidDiagnostic(timestamp,signal,armed,gyro,accel,channelValues,motorValues){
  if(!pidDiagnostic.running)return;
  if(!signal){cancelPidDiagnostic("Receiver signal lost: check interrupted.");return}
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
  if(!armed){cancelPidDiagnostic("Quad disarmed before completion: check interrupted.");return}
  if(performance.now()>=pidDiagnostic.readyAt)
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
  if(flightLog.recording)status.textContent="Recording in progress: disarm before downloading.";
  else if(flightLog.count)status.textContent=`${flightLog.count} samples available · ${(flightLog.count/flightLog.rate).toFixed(1)} seconds · ${flightLog.rate} Hz`;
  else status.textContent="No flight log available.";
  $("#downloadFlightLogButton").disabled=!state.connected||flightLog.recording||flightLog.count===0||flightLog.downloading;
}
function startFlightLogDownload(){
  if(!state.connected||flightLog.recording||!flightLog.count)return;
  flightLog.downloading=true;flightLog.records=[];$("#downloadFlightLogButton").disabled=true;
  $("#flightLogStatus").textContent="Downloading flight log…";
  $("#flightLogProgress").style.width="0%";
  send("GET_FLIGHT_LOG_CHUNK 0 8",false);
}
function finishFlightLogDownload(){
  flightLog.downloading=false;
  const last=flightLog.records.at(-1);
  const file={format:"FlightCode-Flight-Log",version:4,created:new Date().toISOString(),
    board:state.board||"UNKNOWN",sampleRateHz:flightLog.rate,
    alignment:["boardRoll","boardPitch","boardYaw"].map(id=>Number($(`#${id}`).value)),
    motorDirection:$("#motorDirection").value,rates:getRates(),
    feedforward:getFeedforward(),
    pids:getPids(),tpa:getTpa(),stopReason:last?.stopReason||"UNKNOWN",
    receiverDiagnostics:flightLog.receiverDiagnostics,
    blackboxDiagnostics:flightLog.blackboxDiagnostics,
    samples:flightLog.records};
  if(hasCapability("FILTERS"))file.filters=getFilters();
  const blob=new Blob([JSON.stringify(file)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=`FlightCode-FLIGHT-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  $("#flightLogProgress").style.width="100%";updateFlightLogUi();toast("Flight log downloaded");
}
function telemetry(parts){
  if(parts.length<32)return;const timestamp=Number(parts[2]),signal=parts[3]==="1",armed=parts[4]==="1";
  const calibrated=parts[32]==="1";
  const wasArmed=state.armed,wasCalibrated=state.calibrated,wasSignal=state.signal,firstTelemetry=!state.telemetrySeen;
  if(firstTelemetry)resetAttitude();
  state.armed=armed;state.signal=signal;state.telemetrySeen=true;
  if(firstTelemetry||wasArmed!==armed)updateDfuButton();
  if(wasArmed&&!armed)setTimeout(()=>{send("GET_FLIGHT_LOG_INFO",false);if(hasCapability("BLACKBOX_SD")){send("GET_BLACKBOX_STATUS",false);requestBlackboxCatalog()}},250);
  if(!firstTelemetry&&calibrated&&!wasCalibrated)toast("Gyroscope calibration completed");
  state.calibrated=calibrated;
  state.loopHz=Math.round(Number(parts[5]))||0;
  state.maxLoopPeriodUs=parts.length>33?(Math.round(Number(parts[33]))||0):0;
  const rawGyro=parts.length>=37?parts.slice(34,37).map(Number):[NaN,Number(parts[34]),NaN];
  const calibrationSamples=parts.length>=38?Number(parts[37]):0;
  const temperatureC=parts.length>=39?Number(parts[38]):NaN;
  $("#gyroPitchRaw").textContent=Number.isFinite(rawGyro[1])?`RAW: ${rawGyro[1].toFixed(1)}`:"RAW: —";
  const gyro=parts.slice(6,9).map(Number),accel=parts.slice(9,12).map(Number);
  const channelValues=signal?parts.slice(12,28).map(Number):Array(16).fill(0);
  const motorValues=signal?parts.slice(28,32).map(Number):Array(4).fill(0);
  attitude(timestamp,gyro,accel);recordImuDiagnostic(timestamp,gyro,accel);
  recordStationaryDiagnostic(timestamp,gyro,accel,rawGyro,calibrationSamples,temperatureC,calibrated);
  recordPidDiagnostic(timestamp,signal,armed,gyro,accel,channelValues,motorValues);
  channels(channelValues);motors(motorValues);
  if(firstTelemetry||wasSignal!==signal)badge($("#receiverState"),signal?"SIGNAL OK":"NO SIGNAL",signal?"online":"");
  if(firstTelemetry||wasArmed!==armed||wasCalibrated!==calibrated)badge($("#flightState"),armed?"ARMED":calibrated?"DISARMED":"CALIBRATING",armed?"armed":calibrated?"online":"");
}
function setPids(values){let i=0;axes.forEach(([key])=>terms.forEach(term=>$(`#${key}${term}`).value=Number(values[i++]).toFixed(5)))}
function getPids(){return axes.flatMap(([key,label])=>terms.map(term=>{const value=Number($(`#${key}${term}`).value);if(!Number.isFinite(value)||value<0||value>1000)throw new Error(`Invalid ${label} ${term} value`);return value}))}
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
function setFilters(values){$("#gyroLpfHz").value=Number(values[0]).toFixed(0);$("#dtermLpfHz").value=Number(values[1]).toFixed(0)}
function getFilters(){
  const gyro=Number($("#gyroLpfHz").value),dterm=Number($("#dtermLpfHz").value);
  if(!Number.isFinite(gyro)||gyro<50||gyro>250)throw new Error("Gyro low-pass must be between 50 and 250 Hz");
  if(!Number.isFinite(dterm)||dterm<20||dterm>200)throw new Error("D-term low-pass must be between 20 and 200 Hz");
  if(dterm>gyro)throw new Error("D-term low-pass cannot exceed the gyro low-pass");
  return {gyro,dterm};
}
function filtersCommand(){const f=getFilters();return `SET_FILTERS ${f.gyro} ${f.dterm}`}
function setActiveTuningProfile(name){
  document.querySelectorAll("[data-tuning-profile]").forEach(button=>button.classList.toggle("active",button.dataset.tuningProfile===name));
  $("#activeTuningProfile").textContent=name&&tuningProfiles[name]?tuningProfiles[name].label:"CUSTOM";
}
function applyTuningProfile(name){
  const profile=tuningProfiles[name];if(!profile||!state.connected)return;
  setPids(profile.pids);if(profile.rates)setRates([...profile.rates,profile.expo]);else $("#rateExpo").value=profile.expo.toFixed(2);setFeedforward(profile.ff);setTpa(profile.tpa);if(profile.filters)setFilters(profile.filters);
  setActiveTuningProfile(name);saveState("Preset ready to apply","dirty");
  toast(`${profile.label} profile loaded: select Apply or Save`);
}
document.querySelectorAll("[data-tuning-profile]").forEach(button=>button.onclick=()=>applyTuningProfile(button.dataset.tuningProfile));
document.querySelectorAll("[data-pid],[data-rate],[data-feedforward],[data-tpa],[data-filter]").forEach(input=>input.addEventListener("input",()=>setActiveTuningProfile(null)));
function setAlignment(values){$("#boardRoll").value=Number(values[0]).toFixed(1);$("#boardPitch").value=Number(values[1]).toFixed(1);$("#boardYaw").value=Number(values[2]).toFixed(1)}
function getAlignment(){return ["boardRoll","boardPitch","boardYaw"].map(id=>{const value=Number($(`#${id}`).value);if(!Number.isFinite(value)||value < -180||value > 180)throw new Error("Gli angoli devono essere compresi tra -180° e +180°");return value})}
function line(value){
  log(value);if(!value.startsWith("@CFG "))return;const p=value.trim().split(/\s+/);
  if(p[1]==="TELEMETRY"){telemetry(p);return}
  if(p[1]==="BATTERY_VOLTAGE"){updateBattery(Number(p[2]));return}
  if(p[1]==="OSD_STATUS"){
    const wasAvailable=state.osdAvailable,available=p[2]==="1";state.osdAvailable=available;
    if(!state.osdDirty){$("#osdEnabled").checked=p[3]==="1";selectOsdPosition(p[4]||"CENTER");$("#osdConfigState").textContent=p[9]==="1"?"Saved to flash":"Unsaved changes"}updateOsdControls();
    $("#osdDetectionState").textContent=state.osdAvailable?`DETECTED · ${p[6]||"FONT ?"}`:`NOT DETECTED · OSDM 0x${p[7]||"??"}`;
    $("#osdDetectionState").title=`Video: ${p[5]||"PAL"} · Font: ${p[6]||"unknown"} · OSDM: 0x${p[7]||"??"} · SPI mode: ${p[8]||"?"}`;
    if(available&&!wasAvailable)toast(`OSD detected · ${p[5]||"PAL"}`);return
  }
  if(p[1]==="BLACKBOX_STATUS"){
    state.blackboxState=p[2]||"ERROR";
    if(!state.blackboxDirty)$("#blackboxEnabled").checked=p[3]==="1";
    const capacity=Number(p[4])||0,written=Number(p[5])||0,dropped=Number(p[6])||0;
    const wasBusy=blackbox.busy,catalogCount=Number(p[8])||0,totalBytes=Number(p[9])||0;blackbox.totalBytes=totalBytes;blackbox.busy=p[10]==="1";
    const capacityText=formatCardCapacity(capacity);
    $("#blackboxCapacity").textContent=capacityText.main;$("#blackboxCapacityDetail").textContent=capacityText.detail;
    $("#blackboxStored").textContent=formatBytes(totalBytes);$("#blackboxWrittenDetail").textContent=`${formatBytes(written)} written this power session`;
    $("#blackboxDropped").textContent=dropped.toLocaleString();
    $("#blackboxDroppedCard").classList.toggle("healthy",dropped===0);$("#blackboxDroppedCard").classList.toggle("warning",dropped>0);
    $("#blackboxDroppedDetail").textContent=dropped===0?"Logging pipeline healthy":"The microSD could not keep up";
    $("#blackboxConfigState").textContent=p[7]==="1"?"Saved to flash":"Unsaved changes";
    const flashStorage=hasCapability("BLACKBOX_FLASH");
    const errorNames=["NONE","RESET_FAILED","JEDEC_FAILED","HEADER_READ_FAILED","STATUS_TIMEOUT","ERASE_WREN_FAILED","PROGRAM_WREN_FAILED"];
    const operationNames=["NONE","HEADER","RECORD","FINALIZE","ERASE"];
    const errorCode=Number(p[11])||0,errorOperation=Number(p[12])||0,errorStatus=p[13]||"??",errorAddress=p[14]||"000000";
    $("#blackboxMessage").textContent=blackbox.busy?`Preparing ${flashStorage?"the internal flash":"the microSD"}…`:state.blackboxState==="READY"?`${flashStorage?"Internal flash":"microSD"} detected and ready for long flight logs.`:state.blackboxState==="RECORDING"?"Recording the current flight.":state.blackboxState==="ABSENT"?"Insert a microSD and select Check again.":state.blackboxState==="ERROR"?`${flashStorage?"The internal flash":"The microSD"} could not be initialized.`:"Blackbox is not supported by this board.";
    if(state.blackboxState==="ERROR"){
      const detail=`${errorNames[errorCode]||`ERROR_${errorCode}`} · operation=${operationNames[errorOperation]||errorOperation} · status=0x${errorStatus} · address=0x${errorAddress}`;
      $("#blackboxMessage").textContent=detail;$("#blackboxWriteTestResult").textContent=detail;$("#blackboxWriteTestResult").className="diagnostic-result warn";
    }
    if(!hasCapability("BLACKBOX_CATALOG"))$("#blackboxCatalogMessage").textContent="Update FlightCode firmware to enable persistent flight listing and downloads.";
    updateBlackboxControls();if(blackbox.busy)setTimeout(()=>send("GET_BLACKBOX_STATUS",false),500);else if(hasCapability("BLACKBOX_CATALOG")&&(wasBusy||catalogCount!==blackbox.flights.length))requestBlackboxCatalog();return
  }
  if(p[1]==="BLACKBOX_CATALOG"){
    blackbox.expectedFlights=Number(p[2])||0;blackbox.flights=[];return
  }
  if(p[1]==="BLACKBOX_FLIGHT"&&p.length>=6){
    blackbox.flights.push({id:Number(p[2]),records:Number(p[3]),blocks:Number(p[4]),stopFlag:Number(p[5])});return
  }
  if(p[1]==="BLACKBOX_CATALOG_END"){
    renderBlackboxFlights();return
  }
  if(p[1]==="BLACKBOX_LOG"&&blackbox.downloading&&p.length>=21){
    const flightId=Number(p[2]),index=Number(p[3]),values=p.slice(4).map(Number);
    if(blackbox.flight?.id===flightId)blackbox.records.push(decodeLogRecord(values,index));return
  }
  if(p[1]==="BLACKBOX_CHUNK_END"&&blackbox.downloading){
    const flightId=Number(p[2]),next=Number(p[3]),total=blackbox.flight.records;
    if(blackbox.flight.id!==flightId)return;
    $("#blackboxDownloadProgress").style.width=`${100*Math.min(next,total)/total}%`;
    if(next<total)send(`GET_BLACKBOX_CHUNK ${flightId} ${next} 4`,false);else finishBlackboxDownload();return
  }
  if(p[1]==="SBUS_DIAGNOSTICS"&&p.length>=9){
    const valid=p[2]==="1",age=Number(p[3]),frames=Number(p[4]),errors=Number(p[5]),recoveries=Number(p[6]),overruns=Number(p[7]),invalid=Number(p[8]);
    updateSbusDiagnostics(valid,age,frames,errors,recoveries,overruns,invalid);
    $("#receiverState").title=`Frame age: ${age===4294967295?"never":`${age} ms`} · Valid: ${frames} · UART errors: ${errors} · Recoveries: ${recoveries} · Overruns: ${overruns} · Invalid: ${invalid}`;return
  }
  if(p[1]==="HELLO"){
    if(!["FlightCode","FlightCodePI"].includes(p[2])){toast(`Unrecognized device: ${p[2]||"unknown"}`);return}
    state.protocol=Number(p[3])||1;state.board=p[4]||p[2]||"UNKNOWN";state.capabilities=new Set();setReceiverProtocols(["SBUS"],false);updateConnectionText();
    if(state.protocol<3&&p[2]==="FlightCode")state.capabilities=new Set(["PIDS","MOTOR_TEST","TELEMETRY","MOTOR_PROTOCOL","BOARD_ALIGNMENT","MOTOR_DIRECTION","MOTOR_IDLE","RATES","FEEDFORWARD","TPA","GYRO_CALIBRATION","FLIGHT_LOG","PID_SIM","DFU","TELEMETRY_EXT"]);
    if(state.protocol<3&&p[2]==="FlightCodePI")state.capabilities=new Set(["PIDS","MOTOR_TEST","TELEMETRY","MOTOR_PROTOCOL"]);
    updateMotorProtocolOptions();applyCapabilities();window.firmwareFlasher?.setDetectedBoard?.(state.board);
    $("#deviceName").textContent=`FlightCode · ${state.board}`;$("#protocolText").textContent=`Protocol v${state.protocol}`;view("setup");toast(`${state.board} detected`);
    if(hasCapability("FLIGHT_LOG"))send("GET_FLIGHT_LOG_INFO",false);
    if(hasCapability("BLACKBOX_SD"))send("GET_BLACKBOX_STATUS",false);if(hasCapability("BLACKBOX_CATALOG"))requestBlackboxCatalog()
    return;
  }
  if(p[1]==="CAPABILITIES"){
    state.capabilities=new Set(p.slice(2));updateMotorProtocolOptions();applyCapabilities();
    if(hasCapability("MAIN_LOOP"))send("GET_MAIN_LOOP",false);
    if(hasCapability("FLIGHT_LOG"))send("GET_FLIGHT_LOG_INFO",false);
    if(hasCapability("BLACKBOX_SD"))send("GET_BLACKBOX_STATUS",false);if(hasCapability("BLACKBOX_CATALOG"))requestBlackboxCatalog()
    return;
  }
  if(p[1]==="RECEIVER_PROTOCOLS"){setReceiverProtocols(p.slice(2),true);return}
  if(p[1]==="IMU"){
    const available=p.at(-1)==="1",name=p.slice(2,-1).join(" ");
    state.imuName=name;$("#diagnosticImuName").textContent=name||"IMU —";
    $("#deviceName").textContent=`FlightCode · ${state.board} · ${name}`;
    if(!available)toast(`IMU not detected: ${name}`);
    return;
  }
  if(p[1]==="FLIGHT_LOG_INFO"){
    flightLog.count=Number(p[2])||0;flightLog.rate=Number(p[3])||200;flightLog.recording=p[4]==="1";
    flightLog.receiverDiagnostics=p.length>=10?{
      lossReason:["NONE","FAILSAFE","TIMEOUT"][Number(p[5])]||"UNKNOWN",
      frameAgeMs:Number(p[6]),validFrames:Number(p[7]),
      uartErrors:Number(p[8]),recoveries:Number(p[9])}:null;
    updateFlightLogUi();return;
  }
  if(p[1]==="BLACKBOX_DIAGNOSTICS"&&p.length>=16){
    const reject=Number(p[4])||0;
    flightLog.blackboxDiagnostics={
      jedecId:p[2],startCalls:Number(p[3]),startRejectMask:reject,
      startRejectReasons:[reject&1?"DISABLED":null,reject&2?"NOT_READY":null,reject&4?"ERASING":null,reject&8?"INVALID_WRITE_BANK":null,reject&16?"WRITE_BANK_IS_RETAINED":null].filter(Boolean),
      appendCalls:Number(p[5]),stopCalls:Number(p[6]),completedRecords:Number(p[7]),
      lastRetain:p[8]==="1",state:Number(p[9]),operation:Number(p[10]),queueCount:Number(p[11]),
      writeBank:Number(p[12]),retainedBank:Number(p[13]),eraseActive:p[14]==="1",finalisePending:p[15]==="1"};
    return;
  }
  if(p[1]==="BLACKBOX_WRITE_TEST"&&p.length>=10){
    const ok=p[6]==="1",mismatch=Number(p[7]);
    const result=$("#blackboxWriteTestResult");
    const phases=`erased=${p[3]} · program=${p[4]} · read=${p[5]}`;
    result.textContent=ok
      ?`Write test passed at 0x${p[2]} · ${phases} · bank is being erased again`
      :`Write test failed at 0x${p[2]} · ${phases} · byte ${mismatch}: expected 0x${p[8]}, read 0x${p[9]}`;
    result.className=`diagnostic-result ${ok?"ok":"warn"}`;
    toast(ok?"Internal flash write/read test passed":"Internal flash write/read test failed");
    return;
  }
  if(p[1]==="BLACKBOX_SESSION_TEST"&&p[2]==="STARTED"){
    $("#blackboxWriteTestResult").textContent="Session test started: finalizing one synthetic record…";
    $("#blackboxWriteTestResult").className="diagnostic-result";
    return;
  }
  if(p[1]==="FLIGHT_LOG"&&flightLog.downloading&&p.length>=19){
    const n=p.slice(3).map(Number),index=Number(p[2]);
    flightLog.records.push(decodeLogRecord(n,index,flightLog.rate));return;
  }
  if(p[1]==="FLIGHT_LOG_CHUNK_END"&&flightLog.downloading){
    const next=Number(p[2]);
    $("#flightLogProgress").style.width=`${100*Math.min(next,flightLog.count)/flightLog.count}%`;
    if(next<flightLog.count)send(`GET_FLIGHT_LOG_CHUNK ${next} 8`,false);else finishFlightLogDownload();
    return;
  }
  if(p[1]==="PIDS"&&p.length>=12){setPids(p.slice(2,11));setActiveTuningProfile(null);saveState(p[11]==="1"?"Saved to flash":"Unsaved changes",p[11]==="1"?"saved":"dirty");return}
  if(p[1]==="RATES"&&p.length>=7){setRates(p.slice(2,6));saveState(p[6]==="1"?"Saved to flash":"Unsaved changes",p[6]==="1"?"saved":"dirty");return}
  if(p[1]==="FEEDFORWARD"&&p.length>=6){setFeedforward(p.slice(2,5));saveState(p[5]==="1"?"Saved to flash":"Unsaved changes",p[5]==="1"?"saved":"dirty");return}
  if(p[1]==="TPA"&&p.length>=5){setTpa([Number(p[2])*100,Number(p[3])]);saveState(p[4]==="1"?"Saved to flash":"Unsaved changes",p[4]==="1"?"saved":"dirty");return}
  if(p[1]==="FILTERS"&&p.length>=5){setFilters(p.slice(2,4));saveState(p[4]==="1"?"Saved to flash":"Unsaved changes",p[4]==="1"?"saved":"dirty");return}
  if(p[1]==="RECEIVER_CONFIG"&&p.length>=11){setReceiverConfig({protocol:p[2],order:p[3],modes:[{fn:"ARM",channel:Number(p[4]),min:Number(p[5]),max:Number(p[6])},{fn:"BEEP",channel:Number(p[7]),min:Number(p[8]),max:Number(p[9])}]},p[10]==="1");return}
  if(p[1]==="RECEIVER_CONFIG"&&p.length>=10){setReceiverConfig({protocol:"SBUS",order:p[2],modes:[{fn:"ARM",channel:Number(p[3]),min:Number(p[4]),max:Number(p[5])},{fn:"BEEP",channel:Number(p[6]),min:Number(p[7]),max:Number(p[8])}]},p[9]==="1");return}
  if(p[1]==="BOARD_ALIGNMENT"&&p.length>=6){setAlignment(p.slice(2,5));saveState(p[5]==="1"?"Saved to flash":"Unsaved changes",p[5]==="1"?"saved":"dirty");return}
  if(p[1]==="MOTOR_PROTOCOL"){
    if(![...$("#motorProtocol").options].some(option=>option.value===p[2]))$("#motorProtocol").add(new Option(p[2],p[2]));
    $("#motorProtocol").value=p[2];return;
  }
  if(p[1]==="MAIN_LOOP"){
    const hz=Number(p[2]);if([8000,16000,32000].includes(hz))$("#mainLoopHz").value=String(hz);
    $("#mainLoopState").textContent=p[3]==="1"?"Saved · active after reboot":"Unsaved · save and reboot";return;
  }
  if(p[1]==="MOTOR_DIRECTION"){if(["NORMAL","REVERSED"].includes(p[2])){$("#motorDirection").value=p[2];updateMotorDirectionDiagram()}return}
  if(p[1]==="MOTOR_IDLE"){const value=Number(p[2]);if(Number.isFinite(value))$("#motorIdlePercent").value=value.toFixed(1);return}
  if(p[1]==="OK"){
    if(p[2]==="MOTOR_TEST_ENABLED"){
      state.motorTest=true;setMotorControls(true);clearInterval(state.motorHeartbeat);
      sendMotorTest();state.motorHeartbeat=setInterval(sendMotorTest,100);
      toast("Motor test enabled");
    }else if(p[2]==="MOTOR_TEST_DISABLED"){
      resetMotorTestUi();toast("Motor test disabled");
    }else toast(p[2]==="ENTER_DFU"?"Starting bootloader mode…":["SAVE_PIDS","SAVE_SETTINGS"].includes(p[2])?"Settings saved to flash":p[2]==="SET_PIDS"?"PIDs applied":"Values updated");
  }
  if(p[1]==="ERROR"){
    if(p[2]==="ARMED"||p[2]==="ARM_SWITCH"){resetMotorTestUi();toast("Disable the configured ARM switch before motor testing")}
    else if(p[2]==="MOTOR_TEST_DISABLED"){resetMotorTestUi();toast("Motor test interrupted: enable it again")}
    else if(p[2]==="BLACKBOX_RECORDING"||p[2]==="BLACKBOX_BUSY"){
      if(blackbox.downloading){blackbox.downloading=false;blackbox.flight=null;$("#blackboxDownloadState").textContent="Blackbox is still finalizing; try again shortly";updateBlackboxControls()}
    }
    else toast(`Board error: ${p.slice(2).join(" ")}`);
  }
}
async function readLoop(){
  const decoder=new TextDecoder();
  try{while(state.connected&&state.port?.readable){state.reader=state.port.readable.getReader();try{while(state.connected){const{value,done}=await state.reader.read();if(done)break;state.buffer+=decoder.decode(value,{stream:true});const lines=state.buffer.split(/\r?\n/);state.buffer=lines.pop()||"";lines.filter(Boolean).forEach(line)}}finally{state.reader.releaseLock();state.reader=null}}}
  catch(error){if(state.connected&&!state.closing){log(`Connection ended: ${error.message}`,"SYS");await disconnect()}}
}
async function openSerialPort(port){
  state.port=port;await port.open({baudRate:115200});state.writer=port.writable.getWriter();resetAttitude();connected(true);state.task=readLoop();state.heartbeat=setInterval(()=>send("PING",false),1000);await send("HELLO");
}
async function connect(){
  if(!("serial"in navigator)){toast("Use Chrome or Edge: Web Serial is not available");return}
  try{
    let preferred=[];
    try{preferred=FlightCodeSerialPortLogic.preferredPorts(await navigator.serial.getPorts())}catch{}
    for(const port of preferred){
      try{await openSerialPort(port);return}catch{await disconnect()}
    }
    await openSerialPort(await navigator.serial.requestPort());
  }
  catch(error){if(state.port)await disconnect();toast(error.name==="NotFoundError"?"Connection cancelled":error.message)}
}
async function settleWithin(promise,timeoutMs){
  if(!promise)return;
  await Promise.race([promise.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,timeoutMs))]);
}
async function disconnect(){
  if(state.closing)return;state.closing=true;
  const port=state.port,reader=state.reader,writer=state.writer,task=state.task,motorTestActive=state.motorTest;
  clearInterval(state.heartbeat);clearInterval(state.motorHeartbeat);
  state.connected=false;connected(false);buttons.connect.disabled=true;buttons.connect.textContent="Disconnecting...";
  try{
    if(writer&&motorTestActive)await settleWithin(send("MOTOR_TEST_ENABLE 0",false),250);
    if(writer)await settleWithin(send("BYE",false),250);
    if(reader)await settleWithin(reader.cancel(),500);
    if(task)await settleWithin(task,700);
    try{writer?.releaseLock()}catch{}
    try{reader?.releaseLock()}catch{}
    if(port)await settleWithin(port.close(),700);
  }
  catch(error){log(`Port closing error: ${error.message}`,"SYS")}
  finally{Object.assign(state,{port:null,reader:null,writer:null,task:null,buffer:"",heartbeat:null,motorHeartbeat:null,motorTest:false,armed:false,signal:false,telemetrySeen:false,lastUs:null,loopHz:0,maxLoopPeriodUs:0,calibrated:false,attitudeReady:false,gravityReference:[0,0,1],q:[1,0,0,0],closing:false,board:"",protocol:0,capabilities:new Set()});resetAttitude();buttons.connect.disabled=false;connected(false)}
}
buttons.connect.onclick=()=>{if(state.closing)return;return state.connected?disconnect():connect()};
buttons.read.onclick=async()=>{if(hasCapability("PIDS"))await send("GET_PIDS");if(hasCapability("RATES"))await send("GET_RATES");if(hasCapability("FEEDFORWARD"))await send("GET_FEEDFORWARD");if(hasCapability("TPA"))await send("GET_TPA");if(hasCapability("FILTERS"))await send("GET_FILTERS");if(hasCapability("RECEIVER_CONFIG"))await send("GET_RECEIVER_CONFIG")};
buttons.apply.onclick=async()=>{try{if(hasCapability("PIDS"))await send(`SET_PIDS ${getPids().join(" ")}`);if(hasCapability("RATES"))await send(ratesCommand());if(hasCapability("FEEDFORWARD"))await send(feedforwardCommand());if(hasCapability("TPA"))await send(tpaCommand());if(hasCapability("FILTERS"))await send(filtersCommand())}catch(error){toast(error.message)}};
buttons.save.onclick=async()=>{try{if(hasCapability("PIDS"))await send(`SET_PIDS ${getPids().join(" ")}`);if(hasCapability("RATES"))await send(ratesCommand());if(hasCapability("FEEDFORWARD"))await send(feedforwardCommand());if(hasCapability("TPA"))await send(tpaCommand());if(hasCapability("FILTERS"))await send(filtersCommand());await send("SAVE_SETTINGS")}catch(error){toast(error.message)}};
buttons.reset.onclick=()=>send("RESET_PIDS");
buttons.applyProtocol.onclick=async()=>{await send(`SET_MOTOR_PROTOCOL ${$("#motorProtocol").value}`);await send("SAVE_SETTINGS")};
buttons.applyMainLoop.onclick=async()=>{await send(`SET_MAIN_LOOP ${$("#mainLoopHz").value}`);await send("SAVE_SETTINGS");$("#mainLoopState").textContent="Saved · reboot the flight controller";toast("Main loop saved; reboot required")};
buttons.applyMotorDirection.onclick=async()=>{await send(`SET_MOTOR_DIRECTION ${$("#motorDirection").value}`);await send("SAVE_SETTINGS")};
buttons.applyMotorIdle.onclick=async()=>{
  const value=Number($("#motorIdlePercent").value);
  if(!Number.isFinite(value)||value<1||value>10){toast("Motor idle: enter a value between 1% and 10%");return}
  await send(`SET_MOTOR_IDLE ${value}`);await send("SAVE_SETTINGS");
};
buttons.applyReceiver.onclick=async()=>{try{await send(receiverCommand())}catch(error){toast(error.message)}};
function osdCommand(){return `SET_OSD ${$("#osdEnabled").checked?1:0} ${state.osdPosition}`}
function markOsdDirty(){state.osdDirty=true;$("#osdConfigState").textContent="Local changes"}
document.querySelectorAll("[data-osd-position]").forEach(button=>button.onclick=()=>{selectOsdPosition(button.dataset.osdPosition);markOsdDirty()});
$("#osdEnabled").onchange=markOsdDirty;
$("#applyOsdButton").onclick=async()=>{await send(osdCommand());state.osdDirty=false;$("#osdConfigState").textContent="Applied · not saved"};
$("#saveOsdButton").onclick=async()=>{await send(osdCommand());await send("SAVE_SETTINGS");state.osdDirty=false;$("#osdConfigState").textContent="Saved to flash"};
function blackboxCommand(){return `SET_BLACKBOX ${$("#blackboxEnabled").checked?1:0}`}
$("#blackboxEnabled").onchange=()=>{state.blackboxDirty=true;$("#blackboxConfigState").textContent="Local changes"};
$("#refreshBlackboxButton").onclick=()=>{send("GET_BLACKBOX_STATUS");requestBlackboxCatalog()};
$("#blackboxWriteTestButton").onclick=async()=>{
  if(state.armed||blackbox.busy)return;
  $("#blackboxConfigState").textContent="Writing and reading the internal flash…";
  await send("BLACKBOX_WRITE_TEST");
};
$("#blackboxSessionTestButton").onclick=async()=>{
  if(state.armed||blackbox.busy)return;
  $("#blackboxWriteTestResult").textContent="Starting a complete synthetic Blackbox session…";
  await send("BLACKBOX_SESSION_TEST");
};
$("#applyBlackboxButton").onclick=async()=>{await send(blackboxCommand());state.blackboxDirty=false;$("#blackboxConfigState").textContent="Applied · not saved"};
$("#saveBlackboxButton").onclick=async()=>{await send(blackboxCommand());await send("SAVE_SETTINGS");state.blackboxDirty=false;$("#blackboxConfigState").textContent="Saved to flash"};
$("#clearBlackboxButton").onclick=async()=>{
  if(state.armed||blackbox.downloading||!blackbox.flights.length)return;
  if(!confirm("Erase the Blackbox flight catalog? Stored flights will no longer be downloadable."))return;
  await send("CLEAR_BLACKBOX");blackbox.flights=[];renderBlackboxFlights();$("#blackboxDownloadState").textContent="Flight catalog erased";
};
buttons.saveReceiver.onclick=async()=>{try{await send(receiverCommand());await send("SAVE_SETTINGS")}catch(error){toast(error.message)}};
buttons.applyAlignment.onclick=async()=>{try{await send(`SET_BOARD_ALIGNMENT ${getAlignment().join(" ")}`);resetAttitude()}catch(error){toast(error.message)}};
buttons.saveAlignment.onclick=async()=>{try{await send(`SET_BOARD_ALIGNMENT ${getAlignment().join(" ")}`);await send("SAVE_SETTINGS");resetAttitude()}catch(error){toast(error.message)}};
$("#resetAttitudeButton").onclick=resetAttitude;
$("#calibrateGyroButton").onclick=async()=>{
  if(state.armed){toast("Disarm the quad before calibration");return}
  await send("CALIBRATE_GYRO");toast("Calibration in progress: do not move the quad");
};
$("#startImuDiagnosticButton").onclick=startImuDiagnostic;
$("#cancelImuDiagnosticButton").onclick=()=>cancelImuDiagnostic();
$("#downloadImuDiagnosticButton").onclick=downloadImuDiagnostic;
$("#startStationaryDiagnosticButton").onclick=startStationaryDiagnostic;
$("#cancelStationaryDiagnosticButton").onclick=()=>cancelStationaryDiagnostic();
$("#downloadStationaryDiagnosticButton").onclick=downloadStationaryDiagnostic;
$("#pidDiagnosticSafety").onchange=event=>{
  $("#startPidDiagnosticButton").disabled=!state.connected||!hasCapability("PID_SIM")||!event.target.checked||pidDiagnostic.running;
};
$("#startPidDiagnosticButton").onclick=startPidDiagnostic;
$("#cancelPidDiagnosticButton").onclick=()=>cancelPidDiagnostic();
$("#downloadPidDiagnosticButton").onclick=downloadPidDiagnostic;
$("#refreshFlightLogButton").onclick=()=>send("GET_FLIGHT_LOG_INFO");
$("#downloadFlightLogButton").onclick=startFlightLogDownload;
$("#enterDfuButton").onclick=async()=>{
  await enterDfuMode();
};
document.querySelectorAll("[data-pid]").forEach(input=>input.oninput=()=>saveState("Local changes","dirty"));
document.querySelectorAll("[data-rate]").forEach(input=>input.oninput=()=>saveState("Local changes","dirty"));
document.querySelectorAll("[data-feedforward]").forEach(input=>input.oninput=()=>saveState("Local changes","dirty"));
document.querySelectorAll("[data-filter]").forEach(input=>input.oninput=()=>saveState("Local changes","dirty"));
document.querySelectorAll("[data-alignment]").forEach(input=>input.oninput=()=>saveState("Local changes","dirty"));
navigator.serial?.addEventListener("disconnect",()=>disconnect());connected(false);

function motorTestValues(){return [0,1,2,3].map(i=>Number($(`#motorTestSlider${i}`).value))}
async function sendMotorTest(){if(state.motorTest)await send(`MOTOR_TEST ${motorTestValues().join(" ")}`,false)}
function setMotorControls(enabled){
  $("#masterMotorSlider").disabled=!enabled;
  for(let i=0;i<4;i++)$(`#motorTestSlider${i}`).disabled=!enabled;
  badge($("#motorTestState"),enabled?"ACTIVE":"LOCKED",enabled?"armed":"");
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
