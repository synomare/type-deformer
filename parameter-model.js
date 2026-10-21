(function(root) {
  'use strict';
  // Slider travel is a suggestion. Domain constraints protect mathematical
  // meaning; compute limits are checked at rendering and never mutate a value.
  var definitions = Object.create(null), byControl = Object.create(null);
  function register(id,key,spec) {
    if(!spec||typeof spec!=='object'||!spec.slider||!spec.domain||!spec.budget)throw new TypeError('Explicit parameter specification required: '+(key||id));
    var d={key:key||id,slider:Object.assign({},spec.slider),domain:Object.assign({},spec.domain),budget:Object.assign({},spec.budget),reason:spec.reason||'有限の数値'};
    if(!Number.isFinite(d.slider.min)||!Number.isFinite(d.slider.max)||!Number.isFinite(d.slider.step)||d.slider.step<=0)throw new TypeError('Invalid slider specification: '+d.key);
    if(!Object.prototype.hasOwnProperty.call(d.domain,'min')||!Object.prototype.hasOwnProperty.call(d.domain,'max')||typeof d.domain.integer!=='boolean'||[d.domain.min,d.domain.max].some(function(v){return v!==null&&!Number.isFinite(v);})||(d.domain.min!==null&&d.domain.max!==null&&d.domain.min>d.domain.max))throw new TypeError('Invalid semantic domain: '+d.key);
    if(!Number.isFinite(d.budget.absolute)||d.budget.absolute<=0)throw new TypeError('Invalid compute budget: '+d.key);
    Object.freeze(d.slider);Object.freeze(d.domain);Object.freeze(d.budget);Object.freeze(d);
    definitions[d.key]=d;byControl[id]=d;return d;
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
    Object.freeze(copy.slider);Object.freeze(copy.domain);Object.freeze(copy.budget);definitions[key]=Object.freeze(copy);
  }
  root.TypeDeformerParameters={register:register,alias:alias,core:function(prefix,input,result){var next=Object.assign({},result);for(var key in result){var full=prefix+(key==='areaGain'&&prefix==='differential'?'Area':key[0].toUpperCase()+key.slice(1));if(definitions[full]&&typeof result[key]==='number'&&typeof input[key]==='number')next[key]=normalize(full,input[key],result[key]);}return Object.isFrozen(result)?Object.freeze(next):next;},definitions:definitions,byControl:byControl,validate:validate,normalize:normalize,assertBudget:assertBudget};
})(typeof globalThis!=='undefined'?globalThis:this);
