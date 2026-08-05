const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("attitude-logic.js", "utf8"), context);
const attitude = vm.runInContext("FlightCodeAttitude", context);

function state(){return {lastUs:null,attitudeReady:false,gravityReference:[0,0,1],q:[1,0,0,0],angle:{roll:0,pitch:0,yaw:0}}}
function close(actual,expected,tolerance=.8){assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} is not close to ${expected}`)}

const pitchInitial=state(),pitchRadians=35*Math.PI/180;
attitude.update(pitchInitial,10000,[0,0,0],[-Math.sin(pitchRadians),0,Math.cos(pitchRadians)]);
close(pitchInitial.angle.pitch,35,.05);
close(pitchInitial.angle.roll,0,.05);

const rollInitial=state(),rollRadians=-28*Math.PI/180;
attitude.update(rollInitial,10000,[0,0,0],[0,Math.sin(rollRadians),Math.cos(rollRadians)]);
close(rollInitial.angle.roll,-28,.05);

function simulate(axis,rate,duration){
  const result=state(),dt=.01,steps=Math.round(duration/dt);
  for(let i=0;i<=steps;i++){
    const angle=rate*i*dt*Math.PI/180;
    const gyro=axis==="pitch"?[0,rate,0]:axis==="roll"?[rate,0,0]:[0,0,rate];
    const accel=axis==="pitch"?[-Math.sin(angle),0,Math.cos(angle)]:axis==="roll"?[0,Math.sin(angle),Math.cos(angle)]:[0,0,1];
    attitude.update(result,10000+i*10000,gyro,accel);
  }
  return result.angle;
}

close(simulate("pitch",30,1).pitch,30);
close(simulate("roll",-25,1).roll,-25);
close(simulate("yaw",40,1).yaw,40);

const wrapped=state();
attitude.update(wrapped,0xfffffff0,[0,0,0],[0,0,1]);
attitude.update(wrapped,9984,[0,0,90],[0,0,1]);
close(wrapped.angle.yaw,.9,.1);

console.log("Configurator attitude logic tests passed");
