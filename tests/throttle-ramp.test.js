const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync("app.js","utf8");
const field={value:"300"};
const context=vm.createContext({$:()=>field,saveState:(...args)=>{context.saved=args}});
const command=source.match(/function throttleRampCommand\(\)\{[\s\S]*?\n\}/)[0];
vm.runInContext(command,context);
for(const value of ["0","300","1000"]){field.value=value;assert.equal(vm.runInContext("throttleRampCommand()",context),`SET_THROTTLE_RAMP ${value}`)}
for(const value of [""," ","NaN","Infinity","-1","1001"]){field.value=value;assert.throws(()=>vm.runInContext("throttleRampCommand()",context))}
const handler=source.split("\n").find(line=>line.includes('if(p[1]==="THROTTLE_RAMP"'));
vm.runInContext('function receive(p){'+handler+'}',context);
vm.runInContext('receive(["@CFG","THROTTLE_RAMP","400","1"])',context);
assert.equal(field.value,400);assert.equal(context.saved[1],"saved");
vm.runInContext('receive(["@CFG","THROTTLE_RAMP","0","0"])',context);
assert.equal(field.value,0);assert.equal(context.saved[1],"dirty");
assert.ok(source.includes('setCapabilityControls("[data-throttle-ramp]","THROTTLE_RAMP")'));
for(const file of ["app.js","index.html"])assert.equal(fs.readFileSync(file,"utf8"),fs.readFileSync("android/app/src/main/assets/configurator/"+file,"utf8"));
console.log("Throttle ramp configurator tests passed");
