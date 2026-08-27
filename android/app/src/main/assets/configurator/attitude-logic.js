const FlightCodeAttitude=(()=>{
  const toRadians=Math.PI/180;
  const toDegrees=180/Math.PI;

  function normalizeQuaternion(q){
    const norm=Math.hypot(...q)||1;
    return q.map(value=>value/norm);
  }

  function quaternionFromEuler(roll,pitch,yaw){
    const cr=Math.cos(roll*.5),sr=Math.sin(roll*.5);
    const cp=Math.cos(pitch*.5),sp=Math.sin(pitch*.5);
    const cy=Math.cos(yaw*.5),sy=Math.sin(yaw*.5);
    return normalizeQuaternion([
      cr*cp*cy+sr*sp*sy,
      sr*cp*cy-cr*sp*sy,
      cr*sp*cy+sr*cp*sy,
      cr*cp*sy-sr*sp*cy
    ]);
  }

  function reset(state){
    state.lastUs=null;
    state.attitudeReady=false;
    state.gravityReference=[0,0,1];
    state.q=[1,0,0,0];
    state.angle={roll:0,pitch:0,yaw:0};
  }

  function update(state,timestamp,gyro,accel){
    let dt=0;
    if(state.lastUs!==null){
      let elapsed=timestamp-state.lastUs;
      if(elapsed<0&&state.lastUs>0xf0000000&&timestamp<0x10000000){
        elapsed=timestamp+0x100000000-state.lastUs;
      }
      dt=Math.max(0,Math.min(.03,elapsed/1e6));
    }
    state.lastUs=timestamp;
    const norm=Math.hypot(accel[0],accel[1],accel[2]);

    if(!state.attitudeReady&&norm>.5){
      /* Immediate absolute roll/pitch; yaw has no accelerometer reference. */
      const roll=Math.atan2(accel[1],accel[2]);
      const pitch=Math.atan2(-accel[0],Math.hypot(accel[1],accel[2]));
      state.q=quaternionFromEuler(roll,pitch,0);
      state.attitudeReady=true;
    }else if(dt>0&&state.attitudeReady){
      let [w,x,y,z]=state.q;
      let gx=gyro[0]*toRadians,gy=gyro[1]*toRadians,gz=gyro[2]*toRadians;
      if(norm>.75&&norm<1.25){
        const ax=accel[0]/norm,ay=accel[1]/norm,az=accel[2]/norm;
        const vx=2*(x*z-w*y),vy=2*(y*z+w*x),vz=1-2*(x*x+y*y);
        /* Trust gravity near rest, then progressively favor the gyro. */
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
    state.angle.roll=Math.atan2(2*(w*x+y*z),1-2*(x*x+y*y))*toDegrees;
    state.angle.pitch=Math.asin(Math.max(-1,Math.min(1,2*(w*y-z*x))))*toDegrees;
    state.angle.yaw=Math.atan2(2*(w*z+x*y),1-2*(y*y+z*z))*toDegrees;
    return state;
  }

  return {reset,update,quaternionFromEuler};
})();
