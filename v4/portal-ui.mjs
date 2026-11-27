// Minimal native OOXML workbook. All text is an inline string, never an executable formula.
export function xlsxBytes(rows){
 const enc=new TextEncoder(),xml=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships',pkg='http://schemas.openxmlformats.org/package/2006/relationships',ct='http://schemas.openxmlformats.org/package/2006/content-types';
 const col=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
 const sheet=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>{const ref=col(j)+(i+1);return typeof v==='number'&&Number.isFinite(v)?'<c r="'+ref+'"><v>'+v+'</v></c>':'<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xml(v)+'</t></is></c>';}).join('')+'</row>').join('');
 const files={
 '[Content_Types].xml':'<Types xmlns="'+ct+'"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
 '_rels/.rels':'<Relationships xmlns="'+pkg+'"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>',
 'xl/workbook.xml':'<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><sheets><sheet name="Laporan" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="'+pkg+'"><Relationship Id="rId1" Type="'+rel+'/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<worksheet xmlns="'+ns+'"><cols><col min="1" max="1" width="46" customWidth="1"/><col min="2" max="10" width="20" customWidth="1"/></cols><sheetData>'+sheet+'</sheetData></worksheet>'
 };
 const crc=bytes=>{let c=0xffffffff;for(const x of bytes){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^(0xedb88320&-(c&1));}return (c^0xffffffff)>>>0;};
 const parts=[],central=[];let offset=0,size=0;
 for(const [name,value] of Object.entries(files)){
  const n=enc.encode(name),d=enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+value),check=crc(d);
  const h=new Uint8Array(30),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,check,true);v.setUint32(18,d.length,true);v.setUint32(22,d.length,true);v.setUint16(26,n.length,true);
  const c=new Uint8Array(46),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(14,33,true);cv.setUint32(16,check,true);cv.setUint32(20,d.length,true);cv.setUint32(24,d.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);
  parts.push(h,n,d);central.push(c,n);offset+=h.length+n.length+d.length;size+=c.length+n.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length/2,true);e.setUint16(10,central.length/2,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 const all=new Uint8Array(offset+size+end.length);let p=0;for(const a of [...parts,...central,end]){all.set(a,p);p+=a.length;}return all;
}
export function exportXlsx(name,rows){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([xlsxBytes(rows)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
// Keep actual numeric cells numeric; neutralize spreadsheet formulas in untrusted text,
 // including leading whitespace, control characters and BOM before a formula prefix.
export function csvText(rows){
 const clean=v=>{
  const s=String(v??'');
  const unsafe=typeof v!=='number'||!Number.isFinite(v);
  const formula=unsafe&&(/^[\s\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]*[=+\-@]/u.test(s)||/^[\t\r\n]/.test(s));
  return '"'+(formula?"'"+s:s).replaceAll('"','""')+'"';
 };
 return '\uFEFF'+rows.map(r=>r.map(clean).join(',')).join('\r\n');
}
export function exportRows(name,rows){const a=document.createElement('a');const u=URL.createObjectURL(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}

export const searchKey=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('id-ID').trim();
export function searchCatalog(catalog,query,limit=8){
 const terms=searchKey(query).split(/\s+/).filter(Boolean);
 if(!terms.length)return [];
 if(!Number.isInteger(limit)||limit<=0)return [];
 const matches=[];for(const s of catalog){const key=searchKey([s.name,s.id,s.category,s.desc].join(' '));if(terms.every(t=>key.includes(t))){matches.push(s);if(matches.length>=limit)break;}}
 return matches;
}
export function deadlineLabel(order,now=Date.now()){
 if(!order.due_at)return '';
 const closed=['completed','cancelled'].includes(order.status);
 const late=!closed&&order.due_at*1000<now;
 const priority=({normal:'Normal',high:'Tinggi',urgent:'Mendesak'})[order.priority]||'Normal';
 return (late?'Terlambat · ':'')+new Date(order.due_at*1000).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB · '+priority;
}
export function createToast(host,{limit=3,duration=6000,schedule=setTimeout}={}){
 return (message,error=false)=>{
  const text=String(message);if(!text.trim())return;
  const kind=error?'error':'info';
  if([...host.children].some(el=>el.textContent===text&&el.dataset.kind===kind))return;
  const t=document.createElement('p');t.textContent=text;t.className=error?'toast toast-error':'toast';t.dataset.kind=kind;
  while(host.children.length>=limit)host.firstElementChild.remove();
  host.append(t);schedule(()=>t.remove(),duration);
 };
}
export function loading(host){
 const el=document.createElement('div');el.className='loading-skeleton';el.setAttribute('role','status');el.setAttribute('aria-label','Memuat data');host.setAttribute('aria-busy','true');host.replaceChildren(el);
}
export function finishLoading(host){host.removeAttribute('aria-busy');}
export function showLoadError(host,retry){
 finishLoading(host);const p=document.createElement('p');p.className='action-error';p.textContent='Data belum dapat dimuat. Periksa koneksi dan coba lagi.';
 const b=document.createElement('button');b.type='button';b.textContent='Coba lagi';b.onclick=()=>retry();host.replaceChildren(p,b);
}

export function createViewData({isExpired,onError}){
 const pending=new WeakMap();
 return async function viewData(host,read,retry,append=false){
  // Coalesce repeated requests to the same view; prevent stale writes and duplicated rows.
  if(pending.has(host)){const e=Error('Data sedang dimuat.');e.busy=true;throw e;}
  if(!append)loading(host);
  const work=(async()=>{try{const data=await Promise.resolve().then(read);if(isExpired())throw Error('Sesi sudah berakhir.');
   if(!append){finishLoading(host);host.replaceChildren();}return data;
  }catch(e){if(!append){finishLoading(host);if(!isExpired())showLoadError(host,()=>retry().catch(onError));}throw e;}
  finally{pending.delete(host);}})();
  pending.set(host,work);return work;
 };
}

// Shared DOM controls: the portal injects its status/session-aware error reporter.
export function node(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
export function createControls({onError,onActionError=onError}){
 function button(parent,label,fn){
  const b=node('button',label);b.type='button';
  b.onclick=async()=>{if(b.disabled)return;b.disabled=true;b.setAttribute('aria-busy','true');try{await fn();}catch(e){onActionError(e);}finally{b.removeAttribute('aria-busy');b.disabled=false;}};
  parent.append(b);return b;
 }
 function fields(parent,label,items,fn){const form=document.createElement('form');form.append(node('h3',label));const inputs={};for(const item of items){const l=node('label',item.label);const inp=document.createElement(item.options?'select':item.type==='textarea'?'textarea':'input');if(item.options){for(const [value,label] of item.options){const option=node('option',label);option.value=value;inp.append(option);}}else if(item.type!=='textarea')inp.type=item.type||'text';inp.required=item.required!==false;if(item.max)inp.maxLength=item.max;if(item.min!=null)inp.min=item.min;if(item.value!=null)inp.value=item.value;if(item.type==='number'){inp.step='1';if(item.upper!=null)inp.max=item.upper;}inp.name=item.key;inputs[item.key]=inp;l.append(inp);form.append(l);}const b=node('button','Simpan','primary');b.type='submit';form.append(b);form.onsubmit=async e=>{e.preventDefault();if(b.disabled||!form.reportValidity())return;b.disabled=true;form.querySelector(':scope > .form-feedback')?.remove();form.setAttribute('aria-busy','true');try{await fn(Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.type==='number'?Number(v.value):v.value.trim()])));}catch(e){onError(e);const feedback=node('p',e.message,'action-error form-feedback');feedback.setAttribute('role','alert');form.prepend(feedback);}finally{form.removeAttribute('aria-busy');b.disabled=false;}};parent.append(form);return form;}
 return {button,fields};
}

// Translate known display enums without changing stored values or inventing meanings.
export function supportKindLabel(kind){const labels={question:'Pertanyaan',complaint:'Komplain',refund:'Pengembalian dana'};return Object.hasOwn(labels,kind)?labels[kind]:String(kind??'');}
export function expenseCategoryLabel(category){const labels={hosting:'Hosting',supplier:'Pemasok',marketing:'Pemasaran',tools:'Peralatan',other:'Lainnya'};return Object.hasOwn(labels,category)?labels[category]:String(category??'');}
