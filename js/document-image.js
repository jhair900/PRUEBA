// Preparación sin pérdida para IA. Los originales de pantalla, borrador y Drive no se modifican.
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AutoCorDocumentImage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const bytes=url=>{const body=url.slice(url.indexOf(',')+1);return Math.floor(body.length*3/4)-(body.endsWith('==')?2:body.endsWith('=')?1:0);};
  function contentBounds(data,width,height,padding){
    let left=width,top=height,right=-1,bottom=-1,partialAlpha=false;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,a=data[i+3];
      if(a!==0&&a!==255)partialAlpha=true;
      if(a===0||a===255&&data[i]===255&&data[i+1]===255&&data[i+2]===255)continue;
      if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;
    }
    if(right<0)return null;
    left=Math.max(0,left-padding);top=Math.max(0,top-padding);
    right=Math.min(width-1,right+padding);bottom=Math.min(height-1,bottom+padding);
    return {x:left,y:top,width:right-left+1,height:bottom-top+1,partialAlpha};
  }
  const wait=(op,work)=>op?op.wait(work):Promise.resolve().then(work);
  async function prepareOne(url,op){
    const originalBytes=bytes(url),unchanged={url,inputBytes:originalBytes,preparedBytes:originalBytes,optimized:false};
    if(originalBytes<65536)return unchanged;
    let image,canvas,cropped,reader,stop;
    try{
      image=new root.Image();
      const loaded=new Promise((resolve,reject)=>{
        image.onload=resolve;image.onerror=()=>reject(new Error('IMAGE_UNREADABLE'));
        stop=()=>{image.src='';reader?.abort();};op?.signal?.addEventListener('abort',stop,{once:true});image.src=url;
      });
      await wait(op,()=>loaded);op?.check();
      const width=image.naturalWidth,height=image.naturalHeight,pixels=width*height;
      if(!pixels||pixels>4000000)return {...unchanged,pixels,preparedPixels:pixels};
      canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
      let all=ctx.getImageData(0,0,width,height);const box=contentBounds(all.data,width,height,16);
      image.src='';canvas.width=0;canvas.height=0;
      if(!box||box.partialAlpha)return {...unchanged,pixels,preparedPixels:pixels};
      const isCrop=box.width<width||box.height<height;
      // No pagar una recodificación por márgenes mínimos o por una imagen ya ajustada.
      if(!isCrop||box.width*box.height>pixels*.75)return {...unchanged,pixels,preparedPixels:pixels};
      cropped=root.document.createElement('canvas');cropped.width=box.width;cropped.height=box.height;
      // Copia exacta de píxeles decodificados, sin interpolación, escalado ni umbral de tinta.
      cropped.getContext('2d').putImageData(all,-box.x,-box.y);
      all=null;
      const blob=await wait(op,()=>new Promise(resolve=>cropped.toBlob(resolve,'image/png')));op?.check();
      if(!blob||blob.size>=originalBytes)return {...unchanged,pixels,preparedPixels:pixels};
      const prepared=await wait(op,()=>new Promise((resolve,reject)=>{
        reader=new root.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('IMAGE_ENCODING_FAILED'));reader.onabort=()=>reject(op?.signal.reason||new Error('IMAGE_CANCELLED'));reader.readAsDataURL(blob);
      }));op?.check();
      return {url:prepared,inputBytes:originalBytes,preparedBytes:blob.size,pixels,preparedPixels:box.width*box.height,optimized:true};
    }catch(error){if(op?.signal?.aborted)throw op.signal.reason;return {...unchanged,skipped:true};}
    finally{
      if(stop)op?.signal?.removeEventListener('abort',stop);
      if(image){image.onload=null;image.onerror=null;image.src='';}if(canvas){canvas.width=0;canvas.height=0;}if(cropped){cropped.width=0;cropped.height=0;}
    }
  }
  async function prepareAttachments(attachments,op){
    const start=Date.now(),inputs=Array.isArray(attachments)?attachments:[attachments],output=[];
    let images=0,inputBytes=0,preparedBytes=0,pixels=0,preparedPixels=0,optimized=0,dimensionsMeasured=true,skipped=0;
    for(const attachment of inputs){
      op?.check();const url=typeof attachment==='string'?attachment:attachment?.dataUrl;
      if(!/^data:image\/(?:png|jpeg|webp|heic|heif);base64,/i.test(url||'')){output.push(attachment);continue;}
      const result=await prepareOne(url,op);op?.check();images++;inputBytes+=result.inputBytes;preparedBytes+=result.preparedBytes;pixels+=result.pixels||0;preparedPixels+=result.preparedPixels||0;optimized+=Number(result.optimized);skipped+=Number(!!result.skipped);if(result.pixels==null)dimensionsMeasured=false;
      output.push(typeof attachment==='string'?result.url:{...attachment,dataUrl:result.url});
    }
    if(images)op?.record('image-preparation',{elapsedMs:Date.now()-start,pages:images,inputBytes,preparedBytes,...(dimensionsMeasured?{pixels,preparedPixels}:{}),optimizedImages:optimized,skippedImages:skipped,outcome:'success'});
    return Array.isArray(attachments)?output:output[0];
  }
  return {contentBounds,prepareAttachments};
});
