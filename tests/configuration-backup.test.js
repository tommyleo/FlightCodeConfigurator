const assert=require('node:assert/strict'),fs=require('node:fs');
const api=require('../configuration-backup.js');
let family='FlightCode',board='SEQUREH7V2',schema=28;
const hex='1234ABCD'.repeat(80); // Longer than several wire chunks.
let live=hex,snapshot='',stage='',expected='',commits=0,fail='',sent=[],busy=[],progress=[],drops=0;
const client=api.createClient({
 identity:()=>({board,firmwareVersion:'1.6.2',configuratorVersion:'1.6.2'}),isSafe:()=>true,timeoutMs:50,
 onBusy:value=>busy.push(value),onProgress:value=>progress.push(value),
 send:async command=>{
  sent.push(command);const p=command.split(' ');let answer;
  if(fail==='drop-first'&&drops++===0)return;
  if(fail==='disconnect'){client.cancel();return}
  if(fail==='timeout')return;
  if(fail==='error'){answer='@CFG ERROR REJECTED'}
  else if(p[0]==='GET_SETTINGS_INFO'){snapshot=live;answer=`@CFG SETTINGS_INFO ${family} ${board} ${schema} ${snapshot.length/2} ${api.crc32(snapshot)} 1`}
  else if(p[0]==='GET_SETTINGS_CHUNK'){answer=`@CFG SETTINGS_CHUNK ${p[1]} ${snapshot.slice(Number(p[1])*2,(Number(p[1])+Number(p[2]))*2)}`;if(fail==='corrupt')answer=answer.slice(0,-2)+'00'}
  else if(p[0]==='RESTORE_SETTINGS_BEGIN'){stage='';expected=p[5];answer='@CFG OK RESTORE_SETTINGS_BEGIN'}
  else if(p[0]==='RESTORE_SETTINGS_CHUNK'){assert.equal(Number(p[1])*2,stage.length);stage+=p[2];answer=`@CFG OK RESTORE_SETTINGS_CHUNK ${p[1]}`}
  else if(p[0]==='RESTORE_SETTINGS_COMMIT'){assert.equal(api.crc32(stage),expected);live=stage;commits++;answer='@CFG OK RESTORE_SETTINGS_COMMIT REBOOT_REQUIRED'}
  else if(p[0]==='RESTORE_SETTINGS_CANCEL'){answer='@CFG OK RESTORE_SETTINGS_CANCEL'}
  else throw Error(command);
  client.handleLine(answer.split(' '));
 }
});
(async()=>{
 assert.equal(api.crc32(Buffer.from('123456789').toString('hex')),'CBF43926');
 const file=await client.backup();assert.equal(file.data,hex);assert.deepEqual(busy,[true,false]);
 const text=JSON.stringify(file);assert.equal(api.parse(text).data,hex);
 fail='drop-first';drops=0;const before=sent.length;assert.equal((await client.backup()).data,hex);assert(sent.slice(before).filter(c=>c==='GET_SETTINGS_INFO').length===2);assert(progress.some(p=>p.includes('retrying')));fail='';
 for(const field of ['data','checksum','size','schema','formatVersion','board','family']){
  const bad={...file};bad[field]=({data:'GG',checksum:'00000000',size:0,schema:0,formatVersion:2,board:'OTHER\nREBOOT',family:'Betaflight'})[field];assert.throws(()=>api.parse(JSON.stringify(bad)));
 }
 assert.throws(()=>api.parse('{}'));assert.throws(()=>api.parse('x'.repeat(32769)));
 assert.throws(()=>api.compatible(file,{...file,board:'PICO2_W'}),/belongs/);
 assert.throws(()=>api.compatible(file,{...file,schema:29}),/format differs/);
 const wrong={...file,board:'OTHER'};await assert.rejects(client.restore(JSON.stringify(wrong)),/belongs/);assert.equal(commits,0);
 live='00'.repeat(hex.length/2);await client.restore(text);assert.equal(live,hex);assert.equal(commits,1);
 fail='corrupt';await assert.rejects(client.backup(),/checksum/);fail='error';await assert.rejects(client.backup(),/rejected/);
 fail='disconnect';await assert.rejects(client.backup(),/disconnected/);fail='timeout';await assert.rejects(client.backup(),/No response/);
 assert.equal(client.busy,false);fail='';assert.equal((await client.backup()).data,hex);
 const unsafe=api.createClient({send:()=>{throw Error('must not send')},isSafe:()=>false,identity:()=>({board})});await assert.rejects(unsafe.backup(),/disarm/);
 const pending=client.backup();await assert.rejects(client.backup(),/already running/);await pending;
 const pi={...file,family:'FlightCodePI',board:'PICO2_W',schema:15};assert.equal(api.parse(JSON.stringify(pi)).family,'FlightCodePI');
 const source=fs.readFileSync('app.js','utf8');assert.match(source,/configurationBackupClient\.handleLine\(p\)/);assert.match(source,/configurationBackupClient\.cancel\(\)/);
 for(const target of ['MAMBAF411','CLRACINGF4','FLYWOOF405NANO','FLYWOOF405NANO_ANALOG','HDZERO_HALO','SEQUREH7V2','FOXEERF722V4','FOXEERH743','HUMMINGBIRD_200RS','PICO2_W']){
  board=target;family=target==='PICO2_W'?'FlightCodePI':'FlightCode';schema=target==='PICO2_W'?15:28;
  const snapshot=await client.backup();live='FF'.repeat(snapshot.size);await client.restore(JSON.stringify(snapshot));assert.equal(live,snapshot.data);
 }
 console.log('PASS backup round-trip, schema and board compatibility, damaged files, CRC, timeouts, disconnects, interlocks, concurrent requests and read-back verification');
})().catch(error=>{console.error(error);process.exitCode=1});
