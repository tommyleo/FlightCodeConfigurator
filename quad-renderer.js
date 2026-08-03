(()=>{
  const canvas=document.getElementById("quadModel"),ctx=canvas.getContext("2d");
  /* Neutral/reset view: almost directly behind, with only a small elevation. */
  const cameraYaw=0,cameraElevation=.16,cameraDistance=6.4,focal=6.8;
  let lastQuaternion=[1,0,0,0];

  const rotate=(p,roll,pitch,yaw)=>{
    let [x,y,z]=p;
    /* Aircraft axes: roll around forward Y, pitch around right X, yaw around up Z. */
    let c=Math.cos(roll),s=Math.sin(roll);[x,z]=[c*x+s*z,-s*x+c*z];
    c=Math.cos(pitch);s=Math.sin(pitch);[y,z]=[c*y-s*z,s*y+c*z];
    c=Math.cos(yaw);s=Math.sin(yaw);return [c*x-s*y,s*x+c*y,z];
  };
  const project=(p,w,h,angles)=>{
    let [x,y,z]=rotate(p,...angles),c=Math.cos(cameraYaw),s=Math.sin(cameraYaw);
    [x,y]=[c*x-s*y,s*x+c*y];
    c=Math.cos(cameraElevation);s=Math.sin(cameraElevation);
    const vy=c*y+s*z,vz=-s*y+c*z,scale=focal/(cameraDistance+vy);
    const unit=Math.min(w,h)*.18;
    return {x:w/2+x*unit*scale,y:h*.53-vz*unit*scale,depth:vy,scale};
  };
  const face=(points,fill,stroke="#78919c",width=1)=>({points,fill,stroke,width});
  const prism=(outline,z0,z1,fill,top)=>{
    const faces=[];
    faces.push(face(outline.map(([x,y])=>[x,y,z1]),top||fill));
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length];
      faces.push(face([[a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],z1],[a[0],a[1],z1]],fill));
    }
    return faces;
  };
  const arm=(a,b,width=.14)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy),px=-dy/n*width,py=dx/n*width;
    const base=[[a[0]+px,a[1]+py],[b[0]+px,b[1]+py],[b[0]-px,b[1]-py],[a[0]-px,a[1]-py]];
    const capScale=.72,cpx=px*capScale,cpy=py*capScale;
    const cap=[[a[0]+cpx,a[1]+cpy],[b[0]+cpx,b[1]+cpy],[b[0]-cpx,b[1]-cpy],[a[0]-cpx,a[1]-cpy]];
    return [...prism(base,-.1,.045,"#10262f","#3f626e"),...prism(cap,.045,.13,"#31515d","#7395a0")];
  };
  const cylinder=(cx,cy,z0,z1,r,segments=14)=>{
    const ring=Array.from({length:segments},(_,i)=>[cx+Math.cos(i*Math.PI*2/segments)*r,cy+Math.sin(i*Math.PI*2/segments)*r]);
    return prism(ring,z0,z1,"#e7eef0","#ffffff");
  };
  const blade=(cx,cy,z,angle,color)=>{
    const length=.74,width=.11,outline=color==="#49df8b"?"#a2ffca":"#fff3a8";
    const half=[[.04,-.18],[.2,-.48],[.64,-1],[.88,-.82],[1,-.24],[.97,.12],[.82,.48],[.36,.42],[.08,.2]];
    const transform=(points,rotation)=>{
      const c=Math.cos(rotation),s=Math.sin(rotation);
      return points.map(([u,v])=>{
        const x=u*length,y=v*width;
        return [cx+x*c-y*s,cy+x*s+y*c,z];
      });
    };
    return [face(transform(half,angle),color,outline,1.25),face(transform(half,angle+Math.PI),color,outline,1.25)];
  };
  function scene(){
    const faces=[];
    faces.push(...arm([-1.48,-1.42],[0,0]),...arm([1.48,-1.42],[0,0]),...arm([-1.48,1.42],[0,0]),...arm([1.48,1.42],[0,0]));
    const bodyBase=[[-.52,-.62],[.52,-.62],[.62,.46],[.38,.68],[0,.8],[-.38,.68],[-.62,.46]];
    const bodyCrown=[[-.4,-.5],[.4,-.5],[.48,.4],[.3,.56],[0,.67],[-.3,.56],[-.48,.4]];
    faces.push(...prism(bodyBase,-.2,.04,"#09151b","#27434d"));
    faces.push(...prism(bodyCrown,.04,.25,"#1d3540","#52727d"));
    const motors=[[-1.48,1.42,4],[1.48,1.42,1],[-1.48,-1.42,3],[1.48,-1.42,2]];
    motors.forEach(([x,y])=>{
      faces.push(...cylinder(x,y,.02,.26,.23));
      faces.push(...blade(x,y,.3,(x*y>0?.28:-.28),y<0?"#49df8b":"#ffd83d"));
    });
    return {faces,motors};
  }
  const model=scene();
  function draw(q=lastQuaternion){
    lastQuaternion=q;
    const rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){
      canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    const [qw,qx,qy,qz]=q;
    /* Axis directions verified against the physical FC in the rear view. */
    const angles=[
      Math.atan2(2*(qw*qx+qy*qz),1-2*(qx*qx+qy*qy)),
      Math.asin(Math.max(-1,Math.min(1,2*(qw*qy-qz*qx)))),
      -Math.atan2(2*(qw*qz+qx*qy),1-2*(qy*qy+qz*qz))
    ];
    const rendered=model.faces.map(f=>{const p=f.points.map(v=>project(v,rect.width,rect.height,angles));return {...f,p,depth:p.reduce((n,v)=>n+v.depth,0)/p.length};}).sort((a,b)=>b.depth-a.depth);
    rendered.forEach(f=>{ctx.beginPath();ctx.moveTo(f.p[0].x,f.p[0].y);f.p.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();ctx.fillStyle=f.fill;ctx.fill();ctx.strokeStyle=f.stroke;ctx.lineWidth=f.width;ctx.stroke();});
    ctx.textAlign="center";ctx.textBaseline="middle";ctx.font="800 11px monospace";
    model.motors.forEach(([x,y,label])=>{const p=project([x,y,.28],rect.width,rect.height,angles);ctx.fillStyle="#0a171c";ctx.fillText(label,p.x,p.y);});
    const fc=project([0,0,.23],rect.width,rect.height,angles);ctx.fillStyle="#eaffff";ctx.font="900 15px monospace";ctx.fillText("FC",fc.x,fc.y);
    const nose=project([0,.92,.26],rect.width,rect.height,angles);ctx.fillStyle="#ff8a42";ctx.beginPath();ctx.arc(nose.x,nose.y,3.5,0,Math.PI*2);ctx.fill();
  }
  window.addEventListener("resize",()=>draw());
  window.quadRenderer={render:draw,reset:()=>draw([1,0,0,0])};
  requestAnimationFrame(()=>draw());
})();
