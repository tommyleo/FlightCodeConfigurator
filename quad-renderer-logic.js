const FlightCodeQuadMath=(()=>{
  function normalizeQuaternion(q){
    const norm=Math.hypot(...q);
    if(!Number.isFinite(norm)||norm<1e-9)return [1,0,0,0];
    return q.map(value=>value/norm);
  }

  function rotateSceneVector(point,quaternion){
    const [w,x,y,z]=normalizeQuaternion(quaternion);
    /*
     * FlightCode uses the aircraft NED frame (X forward, Y right, Z down),
     * while the canvas model is authored as X right, Y forward, Z up.
     * Convert both ends of the quaternion rotation instead of rebuilding
     * three Euler rotations. This preserves pure pitch and avoids gimbal
     * coupling when the model is tilted far from level.
     */
    const body=[point[1],point[0],-point[2]];
    const rotated=[
      (1-2*(y*y+z*z))*body[0]+2*(x*y-w*z)*body[1]+2*(x*z+w*y)*body[2],
      2*(x*y+w*z)*body[0]+(1-2*(x*x+z*z))*body[1]+2*(y*z-w*x)*body[2],
      2*(x*z-w*y)*body[0]+2*(y*z+w*x)*body[1]+(1-2*(x*x+y*y))*body[2]
    ];
    return [rotated[1],rotated[0],-rotated[2]];
  }

  return {normalizeQuaternion,rotateSceneVector};
})();
