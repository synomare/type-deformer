import {createMarblingSceneSession} from './scene-session.mjs';
import {createMarblingNativeSnapshot} from './native-snapshot.mjs';
import {createMarblingOutputJob} from './output-job.mjs';

// Own native resources for exactly the displayed/pending/desired scenes.
// A high-resolution output has its own lease and geometry job, so live reset
// cannot close its raster bands. Host UI/schema/source loaders are still
// required; this module does not pretend to register a menu operator.
export function createMarblingNativeSession({snapshotOptions,sourceOptions,frameOptions}={}) {
  const session=createMarblingSceneSession({sourceOptions,frameOptions}),owners=new Map();
  function synchronous(callback){if(typeof callback!=='function'||callback.constructor?.name==='AsyncFunction')throw new TypeError('Native paint callback must be synchronous');}
  function prune(){
    const retained=new Set(session.retainedSceneData().map(scene=>scene.marblingNative.token)),failures=[];
    for(const [token,owner] of owners)if(!retained.has(token)){
      owners.delete(token);try{owner.dispose();}catch(error){failures.push(error);}
    }
    if(failures.length)throw new AggregateError(failures,'Marbling native resource release failed');
  }
  function ownerOf(packet){
    const owner=owners.get(packet?.scene?.marblingNative?.token);
    if(!owner)throw new Error('Marbling native scene is not prepared or no longer retained');
    return owner;
  }
  function state(){return {...session.state(),native:{scenes:owners.size,
    rasterPixels:[...owners.values()].reduce((n,owner)=>n+owner.state().rasterPixels,0)}};}
  return Object.freeze({
    submit(input,options){
      const snapshot=createMarblingNativeSnapshot({scene:input.scene,params:input.params,compositionState:input.compositionState,
        fontRevision:input.fontRevision,surfaceFxPhase:input.surfaceFxPhase,dataMoshFrame:input.dataMoshFrame,
        destination:input.destination,fontMetrics:input.fontMetrics},snapshotOptions);
      try{session.submit({revision:input.revision,stamp:input.stamp,scene:snapshot.scene,instances:input.instances},options);}
      catch(error){snapshot.dispose();throw error;}
      owners.set(snapshot.scene.marblingNative.token,snapshot);prune();return state();
    },
    advance(budget){const changed=session.advance(budget);prune();return changed;},
    read:session.read,state,
    paint(host,callback){synchronous(callback);const packet=session.read();return ownerOf(packet).paint(host,scene=>callback(scene,packet));},
    setPaused:session.setPaused,
    retry(){session.retry();prune();},
    reset(){session.reset();prune();},
    output(destination,options){
      const packet=session.read(),native=ownerOf(packet).retain();let job;
      try{job=createMarblingOutputJob(packet,destination,options);}catch(error){native.dispose();throw error;}
      function releaseIfCancelled(){if(job.state().status==='cancelled')native.dispose();}
      return Object.freeze({
        read:job.read,require:job.require,advance:job.advance,retry:job.retry,
        state(){return {...job.state(),native:native.state()};},
        cancel(...args){try{return job.cancel(...args);}finally{releaseIfCancelled();}},
        async run(options){try{return await job.run(options);}finally{releaseIfCancelled();}},
        paint(host,callback){synchronous(callback);const result=job.require();return native.paint(host,scene=>callback(scene,result),result.packet.scene);},
        dispose(){try{job.dispose();}finally{native.dispose();}},
      });
    },
  });
}
