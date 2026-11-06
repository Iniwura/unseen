import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const C = {
  paper: '#F6F6F2',
  white: '#FFFFFF',
  ink: '#171914',
  muted: '#73776D',
  line: '#D9DBD2',
  lime: '#D5FB58',
  green: '#256B4A',
  greenWash: '#ECF4E9',
  red: '#BD493F',
  redWash: '#F8E9E6',
};

const FONT = 'Arial, Helvetica, sans-serif';
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const f = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
const blend = (frame: number, start: number, end: number, fadeOutStart: number, finish: number) =>
  f(frame, start, end) * (1 - f(frame, fadeOutStart, finish));
const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
  fontVariantNumeric: 'tabular-nums',
};

const TopBar: React.FC<{frame:number}> = ({frame}) => {
  const s = f(frame, 0, 14);
  return (
    <div style={{position:'absolute',left:120,right:120,top:78}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',opacity:s}}>
        <div style={{display:'flex',alignItems:'center',gap:13}}>
          <span style={{fontSize:31,fontWeight:850,letterSpacing:-2.4}}>UNSEEN</span>
          <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:25,height:25,
            background:C.lime,fontSize:22,fontWeight:900,borderRadius:3}}>✳</span>
        </div>
        <div style={{display:'flex',gap:45,alignItems:'center',color:C.muted,fontSize:16,fontWeight:700}}>
          <span>RELEASE</span><span>EVIDENCE</span><span>AUDIT</span>
          <span style={{display:'inline-flex',alignItems:'center',gap:11,color:C.ink}}>
            <span style={{width:9,height:9,borderRadius:'50%',background:C.ink}}/>
            PRODUCT FILM / WORKFLOW STUDY
          </span>
        </div>
      </div>
      <div style={{marginTop:30,height:1,background:C.ink,transformOrigin:'left',transform:'scaleX('+s+')'}}/>
    </div>
  );
};

const Footer: React.FC<{frame:number}> = ({frame}) => (
  <div style={{position:'absolute',bottom:69,left:120,right:120,borderTop:'1px solid '+C.line,paddingTop:24,
    display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:14,
    fontWeight:750,letterSpacing:1.6,color:C.muted,opacity:f(frame,5,20)}}>
    <span>SWITCH-NATIVE RELEASE REVIEW</span>
    <span style={{display:'flex',alignItems:'center',gap:8}}>SOURCE / VERIFIED LOCAL DEMO<span style={{color:C.ink}}>01 / 04</span></span>
  </div>
);

const Pill: React.FC<{text:string; tone?:'green'|'red'|'neutral'; style?:React.CSSProperties}> =
({text,tone='neutral',style}) => (
  <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:9,
    background:tone==='green'?C.greenWash:tone==='red'?C.redWash:'#F0F0EA',
    color:tone==='green'?C.green:tone==='red'?C.red:C.ink,
    border:'1px solid '+(tone==='green'?'#BCD3BD':tone==='red'?'#E5BBB5':C.line),
    padding:'11px 18px',borderRadius:100,fontSize:17,fontWeight:750,whiteSpace:'nowrap',...style}}>
    <span style={{width:8,height:8,borderRadius:'50%',background:tone==='green'?C.green:tone==='red'?C.red:C.muted}}/>
    {text}
  </span>
);

const Intro: React.FC<{frame:number}> = ({frame}) => {
  const alpha=blend(frame,4,15,77,98);
  const item=f(frame,18,42);
  const check=f(frame,37,53);
  const x=(1-item)*64;
  return (
    <div style={{position:'absolute',inset:0,opacity:alpha,pointerEvents:'none'}}>
      <div style={{position:'absolute',left:120,top:247,color:C.muted,fontSize:17,
        fontWeight:800,letterSpacing:2}}>RELEASE REVIEW / CANDIDATE 01</div>
      <div style={{position:'absolute',left:116,top:327,width:985}}>
        <div style={{fontWeight:750,letterSpacing:-6.1,fontSize:103,lineHeight:1.07,
          transform:'translateY('+(1-item)*30+'px)'}}>
          The build<br/>passed<span style={{color:C.green}}>.</span>
        </div>
        <div style={{color:C.muted,fontSize:25,marginTop:34,maxWidth:650,
          opacity:f(frame,39,57)}}>The baseline looked healthy. But the release was not ready.</div>
      </div>
      <div style={{position:'absolute',left:1180,top:283,width:604,height:513,
        transform:'translateX('+x+'px)',opacity:item,background:C.white,
        borderRadius:20,border:'1px solid '+C.line,
        boxShadow:'0 28px 70px rgba(28,32,20,0.07)',overflow:'hidden'}}>
        <div style={{padding:'35px 39px',borderBottom:'1px solid '+C.line,
          display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontSize:16,color:C.muted,fontWeight:800,letterSpacing:1.5}}>CHECKOUT RELEASE</span>
          <span style={{...mono,fontSize:15,color:C.muted}}>a921b8a5…</span>
        </div>
        <div style={{padding:'45px 39px'}}>
          <div style={{fontSize:17,color:C.muted,fontWeight:700,marginBottom:20}}>Engineering baseline</div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontWeight:800,fontSize:36,letterSpacing:-1.5}}>Tests passed</span>
            <div style={{width:55,height:55,border:'2px solid '+C.green,
              borderRadius:55,display:'flex',justifyContent:'center',alignItems:'center',
              fontSize:29,color:C.green,transform:'scale('+Math.max(.001,check)+')'}}>✓</div>
          </div>
          <div style={{marginTop:36,height:13,borderRadius:100,background:'#E8EAE2',overflow:'hidden'}}>
            <div style={{width:(100*check)+'%',height:'100%',background:C.green,borderRadius:100}}/>
          </div>
          <div style={{marginTop:48,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{color:C.muted,fontSize:19}}>Release gate</span>
            <Pill text="Evidence pending"/>
          </div>
          <div style={{marginTop:23,color:C.muted,fontSize:15,...mono}}>exact commit / verification required</div>
        </div>
      </div>
      <div style={{position:'absolute',left:120,bottom:205,width:695,height:2,background:C.line}}>
        <div style={{height:2,width:(f(frame,27,65)*100)+'%',background:C.green}}/>
      </div>
    </div>
  );
};

const Rule: React.FC<{frame:number}> = ({frame}) => {
  const alpha=blend(frame,82,100,181,205);
  const s=f(frame,98,127), card=f(frame,116,148);
  const lineLength=f(frame,142,173);
  return (
    <div style={{position:'absolute',inset:0,opacity:alpha,pointerEvents:'none'}}>
      <div style={{position:'absolute',left:120,top:245,color:C.muted,
        fontSize:17,fontWeight:800,letterSpacing:2}}>A REQUIREMENT OUTSIDE ENGINEERING</div>
      <div style={{position:'absolute',left:120,top:320,width:730,
        opacity:s,transform:'translateY('+((1-s)*32)+'px)'}}>
        <div style={{fontSize:95,fontWeight:760,letterSpacing:-5.6,lineHeight:1.07}}>
          Something<br/>was <span style={{borderBottom:'10px solid '+C.lime}}>missing.</span>
        </div>
        <div style={{marginTop:35,fontSize:24,color:C.muted,lineHeight:1.5,maxWidth:605}}>
          A separate support room carried the acceptance rule.
        </div>
      </div>
      <div style={{position:'absolute',left:1050,top:266,width:730,height:514,
        background:C.white,border:'1px solid '+C.line,borderRadius:20,
        boxShadow:'0 24px 70px rgba(28,32,20,0.06)',overflow:'hidden',
        opacity:card,transform:'translateX('+((1-card)*125)+'px)'}}>
        <div style={{height:84,padding:'0 34px',display:'flex',alignItems:'center',
          justifyContent:'space-between',background:'#F0F1EC',borderBottom:'1px solid '+C.line}}>
          <div style={{display:'flex',alignItems:'center',gap:13}}>
            <div style={{width:35,height:35,background:C.ink,color:C.white,borderRadius:10,
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>S</div>
            <div style={{fontSize:22,fontWeight:800,letterSpacing:-.8}}>support-room</div>
          </div>
          <div style={{color:C.muted,fontSize:15,fontWeight:700}}>SOURCE / OWNER-DEFINED</div>
        </div>
        <div style={{padding:'53px 39px'}}>
          <div style={{fontSize:16,color:C.muted,fontWeight:800,letterSpacing:1.4}}>REFUND ACCEPTANCE RULE</div>
          <div style={{fontSize:38,lineHeight:1.27,fontWeight:760,letterSpacing:-1.6,marginTop:24}}>
            Total refunds must never<br/>exceed the captured amount.
          </div>
          <div style={{height:10,width:(lineLength*585)+'px',borderRadius:8,background:C.lime,marginTop:35}}/>
          <div style={{marginTop:56,display:'flex',justifyContent:'space-between'}}>
            <span style={{fontSize:17,color:C.muted}}>Recovered by the support investigator</span>
            <span style={{...mono,fontSize:16,color:C.ink}}>UNSEEN/1</span>
          </div>
        </div>
      </div>
      <div style={{position:'absolute',left:839,top:518,width:210,height:2,background:C.line}}>
        <div style={{width:(lineLength*100)+'%',height:2,background:C.ink}}/>
        <div style={{position:'absolute',left:lineLength*204-1,top:-5,width:11,height:11,
          borderRadius:10,background:C.ink}}/>
      </div>
    </div>
  );
};

const NumberCard: React.FC<{frame:number;start:number;label:string;amount:string;red?:boolean;x:number}> =
({frame,start,label,amount,red,x})=>{
  const a=f(frame,start,start+23);
  const y=(1-a)*75;
  return (
    <div style={{position:'absolute',left:x,top:366,width:475,height:285,
      background:C.white,border:'1px solid '+(red?'#DDACA7':C.line),borderRadius:16,
      opacity:a,transform:'translateY('+y+'px)',overflow:'hidden'}}>
      <div style={{height:12,background:red?C.red:C.lime,transformOrigin:'left',transform:'scaleX('+a+')'}}/>
      <div style={{padding:38}}>
        <div style={{fontSize:17,fontWeight:800,letterSpacing:1.5,color:C.muted}}>{label}</div>
        <div style={{fontSize:112,fontWeight:790,letterSpacing:-6,marginTop:17,color:red?C.red:C.ink}}>{amount}</div>
      </div>
    </div>
  );
};

const Regression:React.FC<{frame:number}> = ({frame})=>{
  const alpha=blend(frame,178,197,286,311);
  const violation=f(frame,255,281);
  return (
    <div style={{position:'absolute',inset:0,opacity:alpha,pointerEvents:'none'}}>
      <div style={{position:'absolute',left:120,top:232,fontSize:17,color:C.muted,
        fontWeight:800,letterSpacing:2}}>INDEPENDENT REGRESSION / EXACT GIT COMMIT</div>
      <div style={{position:'absolute',left:120,top:284,fontSize:56,fontWeight:790,letterSpacing:-2.6}}>
        Refunds must stay within the captured amount.
      </div>
      <NumberCard frame={frame} start={194} label="CAPTURED" amount="$100" x={120}/>
      <NumberCard frame={frame} start={207} label="ALREADY REFUNDED" amount="$50" x={624}/>
      <NumberCard frame={frame} start={220} label="REQUESTED NEXT" amount="$60" x={1128} red/>
      <div style={{position:'absolute',left:120,right:120,top:710}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',color:C.muted,
          fontSize:18,fontWeight:750,letterSpacing:1.5,marginBottom:19}}>
          <span>CUMULATIVE REFUND</span><span>CAPTURED LIMIT / $100</span>
        </div>
        <div style={{height:28,background:'#E6E8E0',borderRadius:15,position:'relative'}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:(100*f(frame,231,266))+'%',
            borderRadius:15,background:C.green,overflow:'hidden'}}/>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:(100*f(frame,252,282))+'%',
            borderRadius:15,background:C.red,clipPath:'inset(0 0 0 90.9%)'}}/>
          <div style={{position:'absolute',right:'9.1%',top:-12,width:3,height:52,background:C.ink,
            transform:'scaleY('+f(frame,245,262)+')'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:21}}>
          <span style={{...mono,fontSize:18,color:C.muted}}>captured $100</span>
          <span style={{color:C.red,fontSize:27,letterSpacing:-1.1,fontWeight:800,
            opacity:violation}}>Attempted total $110 · exceeds limit by $10</span>
        </div>
      </div>
    </div>
  );
};

const Blocked:React.FC<{frame:number}> = ({frame})=>{
  const show=f(frame,297,316);
  const line=f(frame,314,332);
  const seal=spring({frame:Math.max(0,frame-326),fps:30,config:{damping:16,stiffness:165,mass:1}});
  return (
    <div style={{position:'absolute',inset:0,opacity:show,pointerEvents:'none'}}>
      <div style={{position:'absolute',left:120,top:256,color:C.muted,fontWeight:800,
        letterSpacing:2,fontSize:18}}>GATEKEEPER DECISION / EXACT COMMIT</div>
      <div style={{position:'absolute',left:116,top:338,fontWeight:830,fontSize:139,
        lineHeight:1.03,letterSpacing:-9,transform:'translateY('+((1-show)*40)+'px)'}}>
        RELEASE<br/><span style={{color:C.red}}>BLOCKED.</span>
      </div>
      <div style={{position:'absolute',left:120,top:690,width:870,height:12,background:C.line}}>
        <div style={{background:C.red,width:(line*100)+'%',height:12}}/>
      </div>
      <div style={{position:'absolute',left:1180,top:335,width:605,height:360,
        border:'1px solid #E9BCB6',background:C.white,borderRadius:16,
        display:'flex',flexDirection:'column',justifyContent:'space-between',padding:39,
        transform:'translateY('+((1-seal)*45)+'px)',opacity:seal}}>
        <span style={{fontWeight:750,fontSize:17,letterSpacing:1.3,color:C.muted}}>REFUND REGRESSION</span>
        <div style={{fontWeight:820,fontSize:65,letterSpacing:-3.2,color:C.red}}>FAILED</div>
        <div style={{fontSize:22,color:C.ink,fontWeight:700}}>Baseline passed. The second refund did not.</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{...mono,fontSize:17,color:C.muted}}>a921b8a5…</span>
          <Pill text="Gate closed" tone="red"/>
        </div>
      </div>
      <div style={{position:'absolute',left:120,top:766,fontSize:20,color:C.muted,opacity:line}}>
        Re-typeset product explanation. The full proof is in the real Switch recording.
      </div>
    </div>
  );
};

export const ProofStudy:React.FC=()=>{
  const frame=useCurrentFrame();
  useVideoConfig();
  return (
    <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:FONT,overflow:'hidden'}}>
      <TopBar frame={frame}/>
      <Intro frame={frame}/>
      <Rule frame={frame}/>
      <Regression frame={frame}/>
      <Blocked frame={frame}/>
      <Footer frame={frame}/>
    </AbsoluteFill>
  );
};
