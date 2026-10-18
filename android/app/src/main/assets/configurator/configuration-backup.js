/* Full firmware settings backup. Also usable from Node regression tests. */

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FlightCodeConfigurationBackup=api})(globalThis,()=>{

  'use strict';

  const FORMAT='FlightCodeSettingsBackup',MAX_BYTES=4096,CHUNK_BYTES=48;

  function crc32(hex){

    let crc=0xffffffff;

    for(let i=0;i<hex.length;i+=2){crc^=parseInt(hex.slice(i,i+2),16);for(let b=0;b<8;b++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}

    return ((crc^0xffffffff)>>>0).toString(16).padStart(8,'0').toUpperCase();

  }

  function metadata(value){

    if(!value||!['FlightCode','FlightCodePI'].includes(value.family)||!/^[A-Z0-9_]{1,39}$/.test(value.board)||

       !Number.isInteger(value.schema)||value.schema<1||value.schema>65535||!Number.isInteger(value.size)||value.size<1||value.size>MAX_BYTES||

       !/^[0-9a-f]{8}$/i.test(value.checksum))throw Error('Invalid backup metadata');

    return {family:value.family,board:value.board,schema:value.schema,size:value.size,checksum:value.checksum.toUpperCase()};

  }

  function parse(text){

    if(typeof text!=='string'||text.length>32768)throw Error('Invalid or oversized backup file');

    let file;try{file=JSON.parse(text)}catch{throw Error('This is not a valid JSON backup')}

    if(file?.format!==FORMAT||file.formatVersion!==1||file.encoding!=='hex')throw Error('Unsupported backup format');

    const info=metadata(file);

    if(typeof file.data!=='string'||file.data.length!==info.size*2||!/^[0-9a-f]+$/i.test(file.data)||crc32(file.data)!==info.checksum)

      throw Error('Backup is incomplete or damaged; nothing has been loaded');

    return {...info,format:FORMAT,formatVersion:1,encoding:'hex',data:file.data.toUpperCase(),createdAt:String(file.createdAt||''),firmwareVersion:String(file.firmwareVersion||''),configuratorVersion:String(file.configuratorVersion||'')};

  }

  function compatible(a,b){

    if(a.board!==b.board||a.family!==b.family)throw Error(`This backup belongs to ${a.family} / ${a.board}, not ${b.family} / ${b.board}`);

    if(a.schema!==b.schema||a.size!==b.size)throw Error('Settings format differs. Install compatible FlightCode firmware before loading this backup');

  }

  function createClient({send,isSafe,identity,onProgress=()=>{},onBusy=()=>{},timeoutMs=4000}){

    let pending=null,busy=false;

    function safe(){if(!isSafe())throw Error('Connect the board, disarm and stop motor tests before backing up or loading settings')}

    function cancel(message='Board disconnected; operation stopped',code='CANCELLED'){

      if(pending){const item=pending;pending=null;clearTimeout(item.timer);const error=Error(message);error.code=code;item.reject(error)}

    }

    function handleLine(parts){

      if(!pending)return;

      if(parts[1]==='ERROR'){cancel(`Board rejected the operation: ${parts.slice(2).join(' ')}`);return}

      if(pending.match(parts)){const item=pending;pending=null;clearTimeout(item.timer);item.resolve(parts)}

    }

    function request(command,match,timeout=timeoutMs){

      safe();

      if(pending)throw Error('Another settings request is already running');

      return new Promise((resolve,reject)=>{

        const item={match,resolve,reject,timer:null};pending=item;

        item.timer=setTimeout(()=>{if(pending===item)cancel(`No response to ${command.split(' ')[0]}; operation stopped`,'TIMEOUT')},timeout);

        Promise.resolve().then(()=>send(command)).catch(error=>{if(pending===item)cancel(error.message)});

      });

    }

    // Reads are safe to repeat when a response packet is lost. Mutating
    // restore commands always use request directly and are never retried.
    async function readRequest(command,match){
      for(let attempt=1;attempt<=3;attempt++){
        try{return await request(command,match)}catch(error){
          if(error.code!=='TIMEOUT'||attempt===3)throw error;
          onProgress(`No reply received · retrying settings read (${attempt+1}/3)…`);
        }
      }
    }

    async function info(){

      const p=await readRequest('GET_SETTINGS_INFO',p=>p[1]==='SETTINGS_INFO');

      if(p.length!==8)throw Error('Incomplete settings information from firmware');

      const result=metadata({family:p[2],board:p[3],schema:Number(p[4]),size:Number(p[5]),checksum:p[6]});

      if(result.board!==identity().board)throw Error('The connected board changed; reconnect and try again');

      return result;

    }

    async function read(){

      const result=await info();let data='';

      for(let offset=0;offset<result.size;offset+=CHUNK_BYTES){

        const count=Math.min(CHUNK_BYTES,result.size-offset);

        const p=await readRequest(`GET_SETTINGS_CHUNK ${offset} ${count}`,p=>p[1]==='SETTINGS_CHUNK'&&Number(p[2])===offset);

        if(p.length!==4||!new RegExp(`^[0-9a-f]{${count*2}}$`,'i').test(p[3]))throw Error('Incomplete settings block; no backup was created');

        data+=p[3].toUpperCase();onProgress(`Reading settings · ${Math.round((offset+count)/result.size*100)}%`);

      }

      if(crc32(data)!==result.checksum)throw Error('Settings checksum mismatch; no backup was created');

      return {...result,format:FORMAT,formatVersion:1,encoding:'hex',data,createdAt:new Date().toISOString(),firmwareVersion:identity().firmwareVersion,configuratorVersion:identity().configuratorVersion};

    }

    async function run(operation){

      safe();if(busy)throw Error('A settings operation is already running');

      busy=true;onBusy(true);

      try{return await operation()}finally{busy=false;onBusy(false)}

    }

    return {handleLine,cancel,get busy(){return busy},backup:()=>run(read),

      restore:text=>run(async()=>{

        const file=parse(text);compatible(file,await info());

        const ack=name=>p=>p[1]==='OK'&&p[2]===name;

        try{

          await request(`RESTORE_SETTINGS_BEGIN ${file.family} ${file.board} ${file.schema} ${file.size} ${file.checksum}`,ack('RESTORE_SETTINGS_BEGIN'));

          for(let offset=0;offset<file.size;offset+=CHUNK_BYTES){

            const hex=file.data.slice(offset*2,(offset+CHUNK_BYTES)*2);

            await request(`RESTORE_SETTINGS_CHUNK ${offset} ${hex}`,p=>ack('RESTORE_SETTINGS_CHUNK')(p)&&Number(p[3])===offset);

            onProgress(`Loading settings · ${Math.round(Math.min(offset+CHUNK_BYTES,file.size)/file.size*100)}%`);

          }

          await request('RESTORE_SETTINGS_COMMIT',ack('RESTORE_SETTINGS_COMMIT'),15000);

        }catch(error){if(isSafe())await send('RESTORE_SETTINGS_CANCEL').catch(()=>{});throw error}

        onProgress('Saved to board · verifying all settings…');

        let verified;

        try{verified=await read()}catch(error){throw Error(`Settings were saved, but verification failed: ${error.message}. Reconnect and check before changing firmware`)}

        if(file.data!==verified.data)throw Error('Settings were saved, but read-back differs. Check the board before changing firmware');

        return verified;

      })};

  }

  return {FORMAT,crc32,parse,compatible,createClient};

});

