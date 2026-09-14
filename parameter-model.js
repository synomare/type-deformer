(function(root) {
  'use strict';
  // Slider travel is a suggestion. Domain constraints protect mathematical
  // meaning; compute limits are checked at rendering and never mutate a value.
  var definitions = Object.create(null), byControl = Object.create(null);
  var bounded = {
    beltramiAnisotropy:[0,1-Number.EPSILON],
    ramificationDegree:[2,3],enneperOrder:[1,null],causticIOR:[1.000001,null],
    wassersteinMetric:[Number.MIN_VALUE,null],wassersteinEntropy:[Number.MIN_VALUE,null],
    swarmPlates:[1,3],auxeticOpening:[0,90],marginPct:[0,49],videoDuration:[1,null],fontSize:[1,null]
  };
  function register(id,key,min,max,step,integer) {
    key=key||id; min=Number(min);max=Number(max);step=Number(step)||.01;
    if(['textMeasure','spectralFrequency','counterformPressure','counterformBridge','counterformAngle','counterformTrap','gridCellSize','gridGap','moshBlock','videoDuration'].includes(key))integer=false;
    var name=key.replace(/^p/,'');
    var d={key:key,slider:{min:min,max:max,step:step},domain:{min:null,max:null,integer:!!integer},budget:{absolute:Math.min(1e6,Math.max(8,Math.abs(min),Math.abs(max))*16)},reason:'有限の数値'};
    var signed=/Angle|Rotation|Phase|Yaw|Axis$|Shift|Offset|Skew|Flow|Drift|Bow|Bias|Twist|Turn|Travel|Push|Amount|Force|Stretch/i.test(name);
    var fraction=min>=0 && max<=1 && !/Phase|Speed|Gap|Space|Length|Amplitude/i.test(name);
    var signedFraction=min===-1&&max===1&&/Bias|Balance|Polarity|Contrast|Taper/i.test(name);
    if(fraction){d.domain.min=min;d.domain.max=max;d.reason='割合・補間係数';}
    else if(signedFraction){d.domain.min=-1;d.domain.max=1;d.reason='符号つきの補間係数';}
    else if(!signed && min>=0){d.domain.min=min>0?Math.min(min,step):0;d.reason='非負の寸法・係数';}
    if(integer){d.domain.min=min>=0?Math.ceil(min):min;d.budget.max=Math.max(max,Math.min(100000,max*4));d.reason='整数（計算量は別途制限）';}
    if(min>0 && /Spacing|Cell$|Pitch|Unit$|Band$|WaveLength|Interval/i.test(name))d.budget.minPositive=min/8;
    if(bounded[key]){d.domain.min=bounded[key][0];d.domain.max=bounded[key][1];d.reason='演算の成立条件';}
    if(key==='skewX'||key==='skewY'){d.domain.min=d.domain.max=null;d.domain.excludeRightAngles=true;d.reason='90度の奇数倍を除く角度';}
    if(key==='wassersteinMetric'||key==='wassersteinEntropy')d.reason='0より大きい値';
    if(key==='wassersteinEntropy')d.budget.minPositive=.001;
    if(key==='wassersteinMetric'){d.budget.minPositive=.02;d.budget.max=50;}
    if(key==='beltramiAnisotropy')d.budget.max=.98;
    if(key==='differentialAge')d.budget.max=5;
    if(/CustomRule$/.test(name)){d.domain.min=0;d.domain.max=255;d.domain.integer=true;d.reason='8ビットの規則番号';}
    if(/Posterize$/.test(name)){d.domain.min=2;d.domain.max=256;d.domain.integer=true;d.reason='色階調数';}
    definitions[key]=d;byControl[id]=d;return d;
  }
  function validate(key,raw) {
    var d=definitions[key]||byControl[key],v=typeof raw==='number'?raw:Number(String(raw).trim());
    if(raw==null || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(raw).trim()) || !Number.isFinite(v))return {ok:false,reason:'有限の数値を入力してください。'};
    if(d){var domain=d.domain;
      if(domain.integer&&!Number.isSafeInteger(v))return {ok:false,reason:'正確に表せる整数を入力してください。'};
      if(domain.excludeRightAngles&&Math.abs(Math.cos(v*Math.PI/180))<1e-10)return {ok:false,reason:'90度の奇数倍では変形が定義できません。'};
      if(domain.min!=null&&v<domain.min)return {ok:false,reason:domain.min+'以上を入力してください。'};
      if(domain.max!=null&&v>domain.max)return {ok:false,reason:domain.max+'以下を入力してください。'};
    }
    return {ok:true,value:v};
  }
  function normalize(key,value,fallback,min,max,integer) {
    var d=definitions[key]||byControl[key],v=Number(value);
    if(!Number.isFinite(v))v=Number(fallback)||0;
    if(!d)return Math.max(min==null?-Infinity:min,Math.min(max==null?Infinity:max,integer?Math.round(v):v));
    if(d.domain.excludeRightAngles&&Math.abs(Math.cos(v*Math.PI/180))<1e-10)v=Number(fallback)||0;
    if(d.domain.integer)v=Math.round(v);
    return Math.max(d.domain.min==null?-Infinity:d.domain.min,Math.min(d.domain.max==null?Infinity:d.domain.max,v));
  }
  function assertBudget(key,value){var d=definitions[key]||byControl[key];if(!d)return;
    if(Math.abs(value)>d.budget.absolute || (d.budget.max!=null&&value>d.budget.max) || (d.budget.minPositive!=null&&value>0&&value<d.budget.minPositive))throw new Error(key+': 設定値 '+value+' は現在の計算予算を超えています。値は保持されています。');
  }
  function alias(key,id,transform) {
    var d=byControl[id];if(!d)return;
    var copy=JSON.parse(JSON.stringify(d));copy.key=key;
    function convert(v){if(v==null)return null;return transform==='plus1'?v-1:transform==='pixelate'?(v-1)/31:transform==='posterize'?(v-2)/30:v;}
    copy.domain.min=convert(copy.domain.min);copy.domain.max=convert(copy.domain.max);
    if(transform==='pixelate'||transform==='posterize')copy.domain.integer=false;
    copy.budget.absolute=convert(copy.budget.absolute);copy.budget.max=convert(copy.budget.max);
    definitions[key]=copy;
  }
  root.TypeDeformerParameters={register:register,alias:alias,core:function(prefix,input,result){var next=Object.assign({},result);for(var key in result){var full=prefix+(key==='areaGain'&&prefix==='differential'?'Area':key[0].toUpperCase()+key.slice(1));if(definitions[full]&&typeof result[key]==='number'&&typeof input[key]==='number')next[key]=normalize(full,input[key],result[key]);}return Object.isFrozen(result)?Object.freeze(next):next;},definitions:definitions,byControl:byControl,validate:validate,normalize:normalize,assertBudget:assertBudget};
})(typeof globalThis!=='undefined'?globalThis:this);
