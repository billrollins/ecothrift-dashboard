import { useState } from "react";

// ─── MOCK DATA ───────────────────────────────────────────
const MOCK_ORDER = { id: "C5TC0-OM1-A8R3", vendor: "Costco", units: 80, retailEst: "$6,838" };
const ORDERS_LIST = [
  { id: "C5TC0-OM1-A8R3", vendor: "Costco", units: 80, status: "preprocessing" },
  { id: "AVD-2026-0412", vendor: "Aveda", units: 45, status: "preprocessing" },
  { id: "AMZ-B091-XK3P", vendor: "Amazon", units: 120, status: "standardized" },
];

const RAW_HEADERS = ["Lot ID","Location","Item #","Dept. Code","Department","Item Description","Qty","Unit Retail","Ext. Retail","Model","Serial #","Vendor","Category"];
const RAW_SAMPLE_ROWS = [
  {"Lot ID":"6627645","Location":"1985","Item #":"2127246","Dept. Code":"27","Department":"GARDEN","Item Description":"FAUX CONCRETE FIRE TABLE","Qty":"1","Unit Retail":"399.99","Ext. Retail":"399.99","Model":"","Serial #":"","Vendor":"GHP GROUP INC","Category":"OUTDOOR_FURNITURE"},
  {"Lot ID":"6627645","Location":"1985","Item #":"1969214","Dept. Code":"33","Department":"SMALL APPLIANCES","Item Description":"CUISINART GRIND AND BREW","Qty":"2","Unit Retail":"169.99","Ext. Retail":"339.98","Model":"","Serial #":"","Vendor":"CONAIR LLC","Category":"SMALL_APPLIANCES"},
  {"Lot ID":"6627645","Location":"1985","Item #":"1646074","Dept. Code":"38","Department":"HOME FURNISHINGS","Item Description":"GELLER 47\" SIT/STAND DESK","Qty":"1","Unit Retail":"249.99","Ext. Retail":"249.99","Model":"","Serial #":"","Vendor":"TWIN STAR INTL INC","Category":"HOME_FURNITURE"},
  {"Lot ID":"6627645","Location":"1985","Item #":"1789432","Dept. Code":"27","Department":"GARDEN","Item Description":"KETER RESIN STORAGE SHED","Qty":"1","Unit Retail":"599.99","Ext. Retail":"599.99","Model":"","Serial #":"","Vendor":"KETER PLASTIC","Category":"OUTDOOR_STORAGE"},
  {"Lot ID":"6627645","Location":"1985","Item #":"1523087","Dept. Code":"33","Department":"SMALL APPLIANCES","Item Description":"NINJA FOODI AIR FRYER 6QT","Qty":"3","Unit Retail":"89.99","Ext. Retail":"269.97","Model":"AF100","Serial #":"","Vendor":"SHARKNINJA","Category":"SMALL_APPLIANCES"},
];

const STANDARD_FIELDS = [
  { key:"quantity", label:"Quantity", required:true },
  { key:"description", label:"Description", required:true },
  { key:"title", label:"Title", required:false },
  { key:"brand", label:"Brand", required:false },
  { key:"model", label:"Model", required:false },
  { key:"category", label:"Category", required:false },
  { key:"condition", label:"Condition", required:false },
  { key:"retail_value", label:"Retail Cost", required:true },
  { key:"upc", label:"UPC", required:false },
  { key:"vendor_item_number", label:"Vendor Item #", required:false },
  { key:"notes", label:"Notes", required:false },
];

const INITIAL_FORMULAS = { quantity:"[Qty]", description:"[Item Description]", title:"", brand:"", model:"[Model]", category:"[Category]", condition:"[Condition]", retail_value:"", upc:"", vendor_item_number:"[Item #]", notes:"" };

const AI_FORMULAS = {
  quantity:{formula:"[Qty]",reasoning:"Direct mapping"},
  description:{formula:"TITLE([Item Description])",reasoning:"Primary product description, title-cased"},
  title:{formula:"TITLE([Item Description])",reasoning:"Same source, title-cased"},
  brand:{formula:"TITLE([Vendor])",reasoning:"Vendor field contains brand/manufacturer"},
  model:{formula:"[Model]",reasoning:"Direct mapping"},
  category:{formula:"[Department]",reasoning:"Department maps to category"},
  condition:{formula:"",reasoning:""},
  retail_value:{formula:"[Unit Retail]",reasoning:"Per-unit retail price"},
  upc:{formula:"",reasoning:"No UPC column in manifest"},
  vendor_item_number:{formula:"[Item #]",reasoning:"Direct mapping"},
  notes:{formula:"",reasoning:""},
};

const simulateFormula = (formula, row) => {
  if (!formula || !formula.trim()) return "";
  let result = formula;
  const refs = formula.match(/\[([^\]]+)\]/g);
  if (!refs) return "";
  refs.forEach(m => { const h = m.slice(1,-1); result = result.replace(m, row[h] || ""); });
  if (result.startsWith("TITLE(")) { const inner = result.slice(6,-1); result = inner.split(" ").map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" "); }
  else if (result.startsWith("UPPER(")) result = result.slice(6,-1).toUpperCase();
  else if (result.startsWith("LOWER(")) result = result.slice(6,-1).toLowerCase();
  return result;
};

const STANDARDIZED_ROWS = [
  { id:1, title:"Faux Concrete Fire Table", qty:1, retail:399.99, condition:"Used - Fair", category:"OUTDOOR_FURNITURE", ai_title:"Faux Concrete Fire Pit Table - Gas", ai_brand:"GHP Group", ai_model:"", ai_category:"Outdoor Living", proposed_price:179.99 },
  { id:2, title:"Cuisinart Grind And Brew", qty:2, retail:169.99, condition:"Used - Fair", category:"SMALL_APPLIANCES", ai_title:"Cuisinart Grind & Brew 12-Cup Coffee Maker", ai_brand:"Cuisinart", ai_model:"DGB-550", ai_category:"Coffee & Espresso", proposed_price:74.99 },
  { id:3, title:"Geller 47\" Sit/Stand Desk", qty:1, retail:249.99, condition:"Used - Good", category:"HOME_FURNITURE", ai_title:"Geller 47\" Electric Sit/Stand Desk - Black", ai_brand:"Twin Star", ai_model:"OD1047", ai_category:"Office Furniture", proposed_price:109.99 },
  { id:4, title:"Keter Resin Storage Shed", qty:1, retail:599.99, condition:"Used - Fair", category:"OUTDOOR_STORAGE", ai_title:"Keter Factor 8x6 Resin Storage Shed", ai_brand:"Keter", ai_model:"Factor 8x6", ai_category:"Outdoor Storage", proposed_price:269.99 },
  { id:5, title:"Ninja Foodi Air Fryer 6Qt", qty:3, retail:89.99, condition:"Used - Good", category:"SMALL_APPLIANCES", ai_title:"Ninja Foodi 6-in-1 Air Fryer 6Qt - Black", ai_brand:"Ninja", ai_model:"AF100", ai_category:"Small Kitchen Appliances", proposed_price:39.99 },
];

// ─── NAV ─────────────────────────────────────────────────
const NAV_INBOUND = ["Orders","Preprocessing","Receiving","Processing","Finalization","Disputes"];
function Sidebar({activeItem}){
  const [exp,setExp]=useState({HR:false,Inventory:true,INBOUND:true});
  const t=k=>setExp(p=>({...p,[k]:!p[k]}));
  return(
    <div style={st.sidebar}>
      <div style={st.logo}><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 3 L8 10 Q6 13 8 16 L14 24 L20 16 Q22 13 20 10 Z" fill="#52B788" opacity="0.8"/><path d="M14 6 L10 11 Q9 13 10 15 L14 20 L18 15 Q19 13 18 11 Z" fill="#2D6A4F"/></svg><div><div style={st.logoText}>Eco-Thrift</div><div style={st.logoSub}>another chance for everything & everyone</div></div></div>
      <div style={st.navItem}><span style={st.navIco}>▦</span>Dashboard</div>
      <div style={st.navSec} onClick={()=>t("HR")}><span style={st.navIco}>👤</span>HR<span style={st.chev}>{exp.HR?"▾":"▸"}</span></div>
      {exp.HR&&["Time Clock","Time History","Employees","Sick Leave"].map(i=><div key={i} style={st.navChild}>{i}</div>)}
      <div style={{...st.navSec,...st.navSecAct}} onClick={()=>t("Inventory")}><span style={st.navIco}>📦</span>Inventory<span style={st.chev}>{exp.Inventory?"▾":"▸"}</span></div>
      {exp.Inventory&&<>
        <div style={st.navGrp} onClick={()=>t("INBOUND")}>INBOUND FULFILLMENT<span style={st.chevSm}>{exp.INBOUND?"▾":"▸"}</span></div>
        {exp.INBOUND&&NAV_INBOUND.map(i=><div key={i} style={{...st.navChild,...(i===activeItem?st.navChildAct:{})}}>{i===activeItem&&<div style={st.activeBar}/>}{i}</div>)}
        <div style={st.navGrp}>ITEMS<span style={st.chevSm}>▸</span></div>
        <div style={st.navGrp}>VENDORS<span style={st.chevSm}>▸</span></div>
      </>}
      <div style={st.ver}>v2.21.0</div>
    </div>
  );
}

// ─── STEPPER WITH ACTION BUTTON ──────────────────────────
function Stepper({current,onStep,completedStep,actionButton,actionHint}){
  const steps=[{n:0,l:"Standardize Manifest"},{n:1,l:"AI Cleanup"},{n:2,l:"Manual Review"}];
  const gs=i=>{if(i===current)return"sel";if(i<=completedStep)return"done";if(i===completedStep+1)return"rdy";return"nr";};
  const cs=s=>{const b={...st.chip};if(s==="sel")return{...b,backgroundColor:"#2D6A4F",color:"#fff",fontWeight:700,border:"2px solid #2D6A4F"};if(s==="done")return{...b,backgroundColor:"#52B788",color:"#fff",fontWeight:600,border:"2px solid #52B788"};if(s==="rdy")return{...b,backgroundColor:"#E3F2FD",color:"#1565C0",fontWeight:600,border:"2px solid #90CAF9",animation:"pulse 2s infinite"};return{...b,backgroundColor:"transparent",color:"#aaa",border:"2px solid #ddd",opacity:0.5,cursor:"default"};};
  return(
    <div style={st.stepWrap}>
      <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(21,101,192,0.15)}50%{box-shadow:0 0 0 6px rgba(21,101,192,0.08)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        {steps.map((s,i)=><div key={s.n} onClick={()=>s.n<=completedStep+1&&onStep(s.n)} style={cs(gs(s.n))}>{gs(s.n)==="done"?"✓ ":""}{i+1}. {s.l}</div>)}
      </div>
      <div style={{flex:1}}/>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        {actionHint&&<span style={st.partialHint}>{actionHint}</span>}
        {actionButton}
      </div>
    </div>
  );
}

function ConfirmModal({title,message,confirmLabel,onConfirm,onCancel,danger}){
  return(<div style={st.overlay}><div style={st.modal}><div style={{fontSize:32,marginBottom:8}}>{danger?"⚠️":"ℹ️"}</div><h3 style={st.modalTitle}>{title}</h3><p style={st.modalText}>{message}</p><div style={st.modalActions}><button style={st.btnOutline} onClick={onCancel}>Cancel</button><button style={danger?st.btnDanger:st.btnPrimary} onClick={onConfirm}>{confirmLabel}</button></div></div></div>);
}

// ─── STEP 1: STANDARDIZE ─────────────────────────────────
function Step1({isDone,formulas,setFormulas,aiReasonings,setAiReasonings,aiLoading,setAiLoading,savedFormulas,setSavedFormulas,isCustom,setIsCustom}){
  const [showRawRef,setShowRawRef]=useState(false);
  const [showFormulaPreview,setShowFormulaPreview]=useState(false);
  const [previewGenerated,setPreviewGenerated]=useState(false);
  const [showNewTplModal,setShowNewTplModal]=useState(false);
  const [pendingChange,setPendingChange]=useState(null);
  const [focusedField,setFocusedField]=useState(null);

  const FUNCTIONS=["UPPER","LOWER","TITLE","TRIM","REPLACE","CONCAT","LEFT","RIGHT"];

  const doAI=()=>{setAiLoading(true);setTimeout(()=>{const nf={};const nr={};STANDARD_FIELDS.forEach(f=>{nf[f.key]=AI_FORMULAS[f.key]?.formula||"";if(AI_FORMULAS[f.key]?.reasoning)nr[f.key]=AI_FORMULAS[f.key].reasoning;});setFormulas(nf);setSavedFormulas({...nf});setAiReasonings(nr);setAiLoading(false);setPreviewGenerated(false);},1500);};
  const clearAll=()=>{const c={};STANDARD_FIELDS.forEach(f=>{c[f.key]="";});setFormulas(c);setAiReasonings({});setSavedFormulas(null);setPreviewGenerated(false);};

  const changeFormula=(key,val)=>{
    if(savedFormulas&&savedFormulas[key]!==val&&!isCustom){setPendingChange({key,val});setShowNewTplModal(true);}
    else{setFormulas(p=>({...p,[key]:val}));setPreviewGenerated(false);}
  };
  const confirmNewTpl=()=>{setIsCustom(true);if(pendingChange)setFormulas(p=>({...p,[pendingChange.key]:pendingChange.val}));setPendingChange(null);setShowNewTplModal(false);setPreviewGenerated(false);};

  const getSug=formula=>{
    if(!formula)return[];const lb=formula.lastIndexOf("[");
    if(lb>=0&&formula.indexOf("]",lb)===-1){const p=formula.slice(lb+1).toLowerCase();return RAW_HEADERS.filter(h=>h.toLowerCase().includes(p)).map(h=>`[${h}]`);}
    const parts=formula.split(/[\[\]()]/);const last=(parts[parts.length-1]||"").trim().toUpperCase();
    if(last.length>0)return FUNCTIONS.filter(f=>f.startsWith(last));return[];
  };

  const sample=RAW_SAMPLE_ROWS[0];
  const hasAny=Object.values(formulas).some(v=>v.trim()!=="");
  const s1=isDone?"done":""

  // Generate formula preview: apply ALL formulas to ALL sample rows
  const generatePreview=()=>{setPreviewGenerated(true);};
  const previewCols=STANDARD_FIELDS.filter(f=>formulas[f.key]&&formulas[f.key].trim());

  return(
    <div>
      {isDone&&<div style={st.alertSuccess}><strong>✓ Standardization complete</strong> - {MOCK_ORDER.units} preprocessing row(s) created.</div>}

      {/* Formula Mappings Card */}
      <div style={st.card}>
        <div style={st.cardHeader}>
          <h3 style={st.cardTitle}>Formula Mappings</h3>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {hasAny&&!isDone&&<button style={st.btnTextDanger} onClick={clearAll}>Clear Formulas</button>}
            <button style={{...st.btnOutlineSm,opacity:aiLoading?0.6:1}} onClick={doAI} disabled={aiLoading}>
              {aiLoading?<><span style={st.spinner}/> AI analyzing...</>:<><span style={{fontSize:14}}>✦</span> Use AI</>}
            </button>
          </div>
        </div>

        {/* Template row */}
        <div style={st.tplRow}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:13,color:"#555",fontWeight:500}}>Template:</span>
            <select style={st.tplSelect}><option>No matching templates</option></select>
            <span style={{fontSize:12,color:"#999",fontStyle:"italic"}}>No saved template match</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={st.badge}>{STANDARD_FIELDS.length} fields</span>
            <span style={{fontSize:11,color:"#999",fontFamily:"monospace"}}>Header key: 734f4c7a4fec30554575fddf48ac94ab</span>
          </div>
        </div>

        {/* Formula grid */}
        <div style={st.tableWrap}>
          <table style={st.table}><thead><tr>
            <th style={{...st.th,width:150}}>Standard Field</th>
            <th style={st.th}>Formula Expression</th>
            <th style={{...st.th,width:200}}>Sample Result (Row 1)</th>
          </tr></thead>
          <tbody>{STANDARD_FIELDS.map((field,i)=>{
            const sug=focusedField===field.key?getSug(formulas[field.key]):[];
            const result=simulateFormula(formulas[field.key],sample);
            return(<tr key={field.key} style={i%2===0?st.trEven:{}}>
              <td style={st.td}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontWeight:600,color:"#1B4332",fontSize:13}}>{field.label}{field.required&&<span style={{color:"#c0392b"}}> *</span>}</span>
                  {aiReasonings[field.key]&&<span style={st.aiChip} title={aiReasonings[field.key]}>AI</span>}
                </div>
                <div style={{fontSize:10,color:"#aaa",fontFamily:"monospace"}}>{field.key}</div>
              </td>
              <td style={{...st.td,position:"relative"}}>
                <input style={{...st.fInput,...(isDone?{backgroundColor:"#f5f5f5",color:"#888"}:{}),borderColor:field.required&&!formulas[field.key].trim()&&!isDone?"#e8c4a0":"#DDD5C9"}} value={formulas[field.key]} onChange={e=>changeFormula(field.key,e.target.value)} onFocus={()=>setFocusedField(field.key)} onBlur={()=>setTimeout(()=>setFocusedField(null),150)} placeholder={`e.g. TITLE([${RAW_HEADERS[0]}])`} disabled={isDone}/>
                {sug.length>0&&<div style={st.sugBox}>{sug.slice(0,8).map((sg,si)=><div key={si} style={st.sugItem} onMouseDown={e=>{e.preventDefault();const v=formulas[field.key];const lb=v.lastIndexOf("[");if(sg.startsWith("["))changeFormula(field.key,v.slice(0,lb)+sg);else changeFormula(field.key,sg+"(");}}><code style={{fontSize:12}}>{sg}</code></div>)}</div>}
              </td>
              <td style={st.td}>{result?<div style={st.sampleResult}>{result}</div>:<div style={st.sampleEmpty}>--</div>}</td>
            </tr>);
          })}</tbody></table>
        </div>
      </div>

      {/* Raw Column Reference */}
      <div style={st.card}>
        <div style={{...st.cardHeader,cursor:"pointer",userSelect:"none"}} onClick={()=>setShowRawRef(!showRawRef)}>
          <h3 style={{...st.cardTitle,fontSize:14}}>{showRawRef?"▾":"▸"} Raw Column Reference ({RAW_HEADERS.length} columns)</h3>
          <span style={st.badgeMuted}>Manifest sample - {RAW_SAMPLE_ROWS.length} rows</span>
        </div>
        {showRawRef&&<div style={{...st.tableWrap,marginTop:8}}><table style={st.table}><thead><tr><th style={{...st.thSm,width:40}}>Row</th>{RAW_HEADERS.map(h=><th key={h} style={st.thSm}>{h}</th>)}</tr></thead>
        <tbody>{RAW_SAMPLE_ROWS.map((row,i)=><tr key={i} style={i%2===0?st.trEven:{}}><td style={st.tdSm}>{i+1}</td>{RAW_HEADERS.map(h=><td key={h} style={st.tdSm}>{row[h]}</td>)}</tr>)}</tbody></table></div>}
      </div>

      {/* Formula Preview (applies formulas to ALL sample rows, transposed into standard columns) */}
      <div style={st.card}>
        <div style={{...st.cardHeader,cursor:"pointer",userSelect:"none"}} onClick={()=>{setShowFormulaPreview(!showFormulaPreview);if(!previewGenerated)generatePreview();}}>
          <h3 style={{...st.cardTitle,fontSize:14}}>{showFormulaPreview?"▾":"▸"} Formula Preview</h3>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {showFormulaPreview&&<button style={st.btnSmOut} onClick={e=>{e.stopPropagation();generatePreview();}}>↻ Refresh</button>}
            <span style={st.badgeMuted}>{RAW_SAMPLE_ROWS.length} sample rows</span>
          </div>
        </div>
        <div style={{fontSize:12,color:"#888",marginTop:-8,marginBottom:8}}>Applies current formulas to the manifest sample stored on the order. No data is saved.</div>
        {showFormulaPreview&&previewGenerated&&(
          previewCols.length===0 ? <div style={{fontSize:13,color:"#999",fontStyle:"italic",padding:"12px 0"}}>No formulas mapped yet. Fill in formulas above to see preview.</div> :
          <div style={{...st.tableWrap,maxHeight:300,overflowY:"auto"}}>
            <table style={st.table}><thead style={{position:"sticky",top:0,zIndex:1}}><tr>
              <th style={{...st.thSm,width:40}}>Row</th>
              {previewCols.map(f=><th key={f.key} style={st.thSm}>{f.label}</th>)}
            </tr></thead>
            <tbody>{RAW_SAMPLE_ROWS.map((row,i)=>(
              <tr key={i} style={i%2===0?st.trEven:{}}>
                <td style={st.tdSm}>{i+1}</td>
                {previewCols.map(f=>{
                  const val=simulateFormula(formulas[f.key],row);
                  return <td key={f.key} style={{...st.tdSm,...(f.key==="description"?{fontWeight:500,color:"#1B4332"}:{})}}>{val||"-"}</td>;
                })}
              </tr>
            ))}</tbody></table>
          </div>
        )}
        {showFormulaPreview&&!previewGenerated&&<div style={{fontSize:13,color:"#999",fontStyle:"italic",padding:"12px 0"}}>Click to generate preview...</div>}
      </div>

      {/* Modals */}
      {showNewTplModal&&<div style={st.overlay}><div style={st.modal}><div style={{fontSize:32,marginBottom:8}}>📋</div><h3 style={st.modalTitle}>Create New Template?</h3><p style={st.modalText}>You're modifying a formula from a saved template. Create a new template with your changes, or revert?</p><div style={st.modalActions}><button style={st.btnOutline} onClick={()=>{setPendingChange(null);setShowNewTplModal(false);}}>Revert Change</button><button style={st.btnPrimary} onClick={confirmNewTpl}>Create New Template</button></div></div></div>}
    </div>
  );
}

// ─── STEP 2: AI CLEANUP ──────────────────────────────────
function Step2({orderNumber,isUploaded,onUpload,isCleanupRun}){
  const [dragOver,setDragOver]=useState(false);
  const [uploadLog,setUploadLog]=useState([]);
  const doUpload=()=>{
    setUploadLog([
      {lvl:"info",msg:`Parsing ${orderNumber}-cleaned.csv...`,ts:"12:34:01"},
      {lvl:"info",msg:"Validating columns: row_id, ai_title, ai_brand, ai_model, category, condition, proposed_price",ts:"12:34:02"},
      {lvl:"success",msg:`${STANDARDIZED_ROWS.length} rows validated. Ready to apply.`,ts:"12:34:03"},
    ]);
    onUpload();
  };
  return(
    <div>
      {isCleanupRun&&<div style={st.alertSuccess}><strong>✓ AI Cleanup complete</strong> - {STANDARDIZED_ROWS.length} row(s) updated in preprocessing.</div>}
      {isUploaded&&!isCleanupRun&&<div style={st.alertInfo}><strong>ℹ CSV validated</strong> - {STANDARDIZED_ROWS.length} rows ready. Click <strong>Run Cleanup</strong> in the toolbar to apply changes to preprocessing rows.</div>}
      <div style={st.card}>
        <div style={st.cardHeader}><h3 style={st.cardTitle}>Offline AI Cleanup</h3></div>
        <p style={st.cardDesc}>Download the standardized rows as CSV, run through your AI cleanup externally, then upload back. Upload validates the file but does <strong>not</strong> modify data. Click <strong>Run Cleanup</strong> to apply.</p>
        <p style={{fontSize:12,color:"#888",margin:"-8px 0 16px"}}>Expected columns: <code style={st.codeSm}>row_id, ai_title, ai_brand, ai_model, category, condition, proposed_price</code></p>
        <div style={st.cleanGrid}>
          <div style={st.cleanCard}><div style={st.cleanIcon}>↓</div><h4 style={st.cleanTitle}>Download Cleanup CSV</h4><div style={st.fileName}>{orderNumber}.csv</div><div style={st.chipRow}><span style={st.chipInfo}>{STANDARDIZED_ROWS.length} rows</span></div><button style={st.btnPrimary} onClick={()=>alert(`Downloading ${orderNumber}.csv`)}>Download CSV</button></div>
          <div style={st.cleanCard}><div style={{...st.cleanIcon,color:isUploaded?"#2D6A4F":"#B8860B"}}>{isUploaded?"✓":"↑"}</div><h4 style={st.cleanTitle}>Upload Completed CSV</h4><div style={st.fileName}>{orderNumber}-cleaned.csv</div><div style={st.chipRow}>{isUploaded?<span style={st.chipSuccess}>{STANDARDIZED_ROWS.length} validated</span>:<span style={st.chipWarn}>0 imported</span>}</div>{isUploaded?<div style={st.uploadedBadge}>✓ Validated - Ready to Apply</div>:<div style={{...st.dropZone,...(dragOver?st.dropZoneAct:{})}} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);doUpload();}} onClick={doUpload}>Drop CSV here or click to browse</div>}</div>
        </div>
        {uploadLog.length>0&&<div style={st.logBox}>{uploadLog.map((l,i)=><div key={i} style={{...st.logLine,color:l.lvl==="success"?"#2D6A4F":l.lvl==="error"?"#c0392b":"#666"}}><span style={st.logTs}>{l.ts}</span>{l.msg}</div>)}</div>}
      </div>
    </div>
  );
}

// ─── STEP 3: MANUAL REVIEW ───────────────────────────────
function Step3({completedStep,dirtyCount,missingCount,onSave}){
  const [rows,setRows]=useState(STANDARDIZED_ROWS.map(r=>({...r,final_price:r.proposed_price,dirty:false})));
  const [editCell,setEditCell]=useState(null);
  const [search,setSearch]=useState("");
  const [missingOnly,setMissingOnly]=useState(false);
  const mc=rows.filter(r=>!r.final_price||r.final_price<=0).length;
  const dc=rows.filter(r=>r.dirty).length;
  const tPaid=rows.reduce((s,r)=>s+(r.retail*r.qty),0);
  const tIdeal=rows.reduce((s,r)=>s+((r.proposed_price||0)*r.qty),0);
  const tSet=rows.reduce((s,r)=>s+((r.final_price||0)*r.qty),0);
  const tUnits=rows.reduce((s,r)=>s+r.qty,0);
  const vsI=tIdeal>0?((tSet/tIdeal)*100).toFixed(0):0;
  const filt=rows.filter(r=>{if(missingOnly&&r.final_price&&r.final_price>0)return false;if(search&&!r.ai_title.toLowerCase().includes(search.toLowerCase()))return false;return true;});
  const upd=(id,f,v)=>{setRows(p=>p.map(r=>r.id===id?{...r,[f]:v,dirty:true}:r));};
  const bulkAdj=pct=>{const ids=new Set(filt.map(r=>r.id));setRows(p=>p.map(r=>ids.has(r.id)?{...r,final_price:Math.round((r.final_price*(1+pct/100))*100)/100,dirty:true}:r));};
  const visToIdeal=()=>{const ids=new Set(filt.map(r=>r.id));setRows(p=>p.map(r=>ids.has(r.id)?{...r,final_price:r.proposed_price,dirty:true}:r));};
  const resetToAI=()=>{const ids=new Set(filt.map(r=>r.id));setRows(p=>p.map(r=>{if(!ids.has(r.id))return r;const orig=STANDARDIZED_ROWS.find(o=>o.id===r.id);if(!orig)return r;return{...r,final_price:orig.proposed_price,ai_title:orig.ai_title,ai_brand:orig.ai_brand,ai_category:orig.ai_category,condition:orig.condition,dirty:true};}));};

  return(
    <div>
      {completedStep>=2&&mc===0&&<div style={st.alertSuccess}><strong>✓ Manual review complete</strong> - all staged rows priced.</div>}
      <div style={st.summaryRow}>
        <div style={st.sumChip}><span style={st.sumLabel}>Paid</span><span style={st.sumVal}>${tPaid.toFixed(0)}</span></div>
        <div style={st.sumChip}><span style={st.sumLabel}>Ideal</span><span style={st.sumVal}>${tIdeal.toFixed(0)}</span></div>
        <div style={st.sumChip}><span style={st.sumLabel}>Set</span><span style={{...st.sumVal,color:"#2D6A4F"}}>${tSet.toFixed(0)}</span></div>
        <div style={st.sumChip}><span style={st.sumLabel}>% vs Ideal</span><span style={st.sumVal}>{vsI}%</span></div>
        <div style={st.sumChip}><span style={st.sumLabel}>Units</span><span style={st.sumVal}>{tUnits}</span></div>
        <div style={{...st.sumChip,borderColor:mc>0?"#e8a83e":"#52B788"}}><span style={st.sumLabel}>Missing Price</span><span style={{...st.sumVal,color:mc>0?"#c0392b":"#2D6A4F"}}>{mc}</span></div>
        {dc>0&&<div style={{...st.sumChip,borderColor:"#e8a83e"}}><span style={st.sumLabel}>Unsaved</span><span style={{...st.sumVal,color:"#B8860B"}}>{dc}</span></div>}
      </div>
      <div style={st.ctrlStrip}>
        <input style={st.searchInput} placeholder="Search items..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <button style={missingOnly?st.btnTogAct:st.btnTog} onClick={()=>setMissingOnly(!missingOnly)}>Missing Price</button>
        <div style={{flex:1}}/>
        <button style={st.btnSmOut} onClick={()=>bulkAdj(-10)}>-10%</button>
        <button style={st.btnSmOut} onClick={()=>bulkAdj(10)}>+10%</button>
        <button style={st.btnSmOut} onClick={visToIdeal}>Visible = Ideal</button>
        <button style={st.btnSmOut} onClick={resetToAI}>Reset to AI</button>
        <button style={{...st.btnPrimarySm,opacity:dc>0?1:0.5}} disabled={dc===0}>Save Changes ({dc})</button>
      </div>
      <div style={st.card}><div style={st.tableWrap}><table style={st.table}><thead><tr>
        <th style={{...st.th,width:30}}>#</th><th style={st.th}>Description / Title</th><th style={st.th}>Brand</th><th style={{...st.th,width:55,textAlign:"center"}}>Qty</th><th style={st.th}>Category</th><th style={st.th}>Condition</th><th style={{...st.th,textAlign:"right"}}>Retail</th><th style={{...st.th,textAlign:"right"}}>Ideal</th><th style={{...st.th,textAlign:"right",minWidth:120}}>Price</th><th style={{...st.th,textAlign:"center",width:72}}>vs Ideal</th>
      </tr></thead><tbody>{filt.map((r,i)=>{
        const vs=r.proposed_price>0?(((r.final_price||0)/r.proposed_price)*100).toFixed(0):"--";
        const vc=vs>=95&&vs<=105?"#2D6A4F":vs<95?"#c0392b":"#B8860B";
        return(<tr key={r.id} style={{...(i%2===0?st.trEven:{}),...(r.dirty?{backgroundColor:"#FFFDF0"}:{})}}>
          <td style={{...st.td,color:"#999",fontSize:12}}>{r.id}</td>
          <td style={st.td}><div style={{fontWeight:600,color:"#1B4332",fontSize:13}}>{r.title}</div><div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}><span style={{fontSize:12,color:"#2D6A4F"}}>{r.ai_title}</span><button style={st.applyBtn}>Apply</button></div></td>
          <td style={{...st.td,fontSize:13}}>{r.ai_brand}</td>
          <td style={{...st.td,textAlign:"center"}}>{r.qty}</td>
          <td style={st.td}><span style={st.catTag}>{r.ai_category}</span></td>
          <td style={st.td}><select style={st.condSel} defaultValue={r.condition}><option>Used - Good</option><option>Used - Fair</option><option>Used - Poor</option><option>New</option><option>Refurbished</option></select></td>
          <td style={{...st.td,textAlign:"right",color:"#888"}}>${r.retail.toFixed(2)}</td>
          <td style={{...st.td,textAlign:"right",color:"#2D6A4F",fontSize:12}}>${r.proposed_price?.toFixed(2)}</td>
          <td style={{...st.td,textAlign:"right"}}><div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
            <button style={st.microBtn} onClick={()=>upd(r.id,"final_price",Math.round((r.final_price*0.9)*100)/100)}>-</button>
            {editCell===`${r.id}-p`?<input type="number" step="0.01" style={{...st.inlineInput,width:70,textAlign:"right"}} defaultValue={r.final_price} autoFocus onBlur={e=>{upd(r.id,"final_price",parseFloat(e.target.value)||0);setEditCell(null);}} onKeyDown={e=>e.key==="Enter"&&e.target.blur()}/>:<span style={{fontWeight:700,color:"#1B4332",cursor:"pointer",minWidth:50,textAlign:"right"}} onClick={()=>setEditCell(`${r.id}-p`)}>${(r.final_price||0).toFixed(2)}</span>}
            <button style={st.microBtn} onClick={()=>upd(r.id,"final_price",Math.round((r.final_price*1.1)*100)/100)}>+</button>
          </div></td>
          <td style={{...st.td,textAlign:"center"}}><span style={{...st.vsChip,backgroundColor:vc+"18",color:vc}}>{vs}%</span></td>
        </tr>);
      })}</tbody></table></div></div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────
export default function PreprocessingPage(){
  const [step,setStep]=useState(0);
  const [done,setDone]=useState(-1);
  const [upl,setUpl]=useState(false);
  const [cleanupRun,setCleanupRun]=useState(false);
  const [orderDrop,setOrderDrop]=useState(false);
  const [showConfirm,setShowConfirm]=useState(null);

  // Step 1 state (lifted so stepper can read it)
  const [formulas,setFormulas]=useState({...INITIAL_FORMULAS});
  const [savedFormulas,setSavedFormulas]=useState(null);
  const [aiReasonings,setAiReasonings]=useState({});
  const [aiLoading,setAiLoading]=useState(false);
  const [isCustom,setIsCustom]=useState(false);

  const hasDesc=formulas.description.trim()!=="";
  const hasRetail=formulas.retail_value.trim()!=="";
  const canStandardize=hasDesc&&hasRetail;

  // Determine action button for stepper
  let actionButton=null;
  let actionHint=null;
  if(step===0){
    if(done>=0){
      actionButton=<div style={{display:"flex",gap:8}}>
        <button style={st.btnOutlineWarn} onClick={()=>setShowConfirm("undo")}>🗑 Undo</button>
        <button style={st.btnPrimary} onClick={()=>setShowConfirm("restand")}>Re-standardize</button>
      </div>;
    }else if(canStandardize){
      actionButton=<button style={st.btnPrimary} onClick={()=>{setDone(Math.max(done,0));setStep(1);}}>Standardize</button>;
    }else{
      actionHint="Fill required fields (Description, Retail Cost) to standardize";
    }
  }else if(step===1){
    if(cleanupRun){
      // already done
    }else if(upl){
      actionButton=<button style={st.btnPrimary} onClick={()=>{setCleanupRun(true);setDone(Math.max(done,1));}}>Run Cleanup</button>;
    }
  }else if(step===2){
    const dc=0; // would come from Step3 state in real impl
    const mc=0;
    actionButton=<button style={{...st.btnPrimary,opacity:1}} onClick={()=>setShowConfirm("finalize")}>Finalize and Open Processing →</button>;
  }

  return(
    <div style={st.layout}>
      <Sidebar activeItem="Preprocessing"/>
      <div style={st.main}>
        {/* Header */}
        <div style={st.header}>
          <div style={st.headerLeft}>
            <h1 style={st.pageTitle}>Preprocessing</h1>
            <div style={{position:"relative"}}>
              <button style={st.orderDropBtn} onClick={()=>setOrderDrop(!orderDrop)}>
                <span style={{fontWeight:600,color:"#1B4332"}}>{MOCK_ORDER.id}</span>
                <span style={{color:"#888",margin:"0 4px"}}>-</span>
                <span style={{color:"#555"}}>{MOCK_ORDER.vendor}</span>
                <span style={{color:"#aaa",marginLeft:8,fontSize:11}}>▾</span>
              </button>
              {orderDrop&&<div style={st.orderDropMenu}>{ORDERS_LIST.map(o=>(
                <div key={o.id} style={{...st.orderDropItem,...(o.id===MOCK_ORDER.id?st.orderDropItemAct:{})}} onClick={()=>setOrderDrop(false)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontWeight:600,fontSize:13,color:"#1B4332"}}>{o.id}</span>
                    <span style={{fontSize:10,padding:"1px 6px",borderRadius:3,backgroundColor:o.status==="preprocessing"?"#FFF3E0":"#E8F5EE",color:o.status==="preprocessing"?"#B8860B":"#2D6A4F",fontWeight:600}}>{o.status}</span>
                  </div>
                  <div style={{fontSize:12,color:"#888"}}>{o.vendor} - {o.units} units</div>
                </div>
              ))}</div>}
            </div>
          </div>
          <div style={st.headerRight}>
            <span style={st.headerMeta}>{MOCK_ORDER.units} units</span>
            <span style={st.headerMeta}>Est. {MOCK_ORDER.retailEst}</span>
            <button style={st.backBtn}>← Back to Order</button>
          </div>
        </div>

        {/* Stepper with action button */}
        <Stepper current={step} onStep={n=>{if(n<=done+1)setStep(n);}} completedStep={done} actionButton={actionButton} actionHint={actionHint}/>

        <div style={st.content}>
          {step===0&&<Step1 isDone={done>=0} formulas={formulas} setFormulas={setFormulas} aiReasonings={aiReasonings} setAiReasonings={setAiReasonings} aiLoading={aiLoading} setAiLoading={setAiLoading} savedFormulas={savedFormulas} setSavedFormulas={setSavedFormulas} isCustom={isCustom} setIsCustom={setIsCustom}/>}
          {step===1&&<Step2 orderNumber={MOCK_ORDER.id} isUploaded={upl} onUpload={()=>setUpl(true)} isCleanupRun={cleanupRun}/>}
          {step===2&&<Step3 completedStep={done}/>}
        </div>
      </div>

      {/* Global modals */}
      {showConfirm==="undo"&&<ConfirmModal title="Undo Standardization" message="This will delete all preprocessing rows. AI cleanup and manual review data will also be removed." confirmLabel="Delete & Undo" danger onConfirm={()=>{setShowConfirm(null);setDone(-1);setUpl(false);setCleanupRun(false);setStep(0);}} onCancel={()=>setShowConfirm(null)}/>}
      {showConfirm==="restand"&&<ConfirmModal title="Re-standardize Manifest" message="This will rebuild all preprocessing rows. AI cleanup and manual review changes will be reset." confirmLabel="Re-standardize" onConfirm={()=>{setShowConfirm(null);setDone(Math.max(done,0));setStep(1);}} onCancel={()=>setShowConfirm(null)}/>}
      {showConfirm==="finalize"&&<ConfirmModal title="Finalize Preprocessing" message="This will lock the manifest and move all staged rows into Processing." confirmLabel="Finalize and Open Processing" onConfirm={()=>{setShowConfirm(null);alert("→ /inventory/processing?order="+MOCK_ORDER.id);}} onCancel={()=>setShowConfirm(null)}/>}
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const st = {
  layout:{display:"flex",minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",backgroundColor:"#F4F1EB",color:"#1a1a1a"},
  sidebar:{width:220,backgroundColor:"#1B4332",color:"#D8E8DF",display:"flex",flexDirection:"column",flexShrink:0,position:"relative"},
  logo:{display:"flex",alignItems:"center",gap:10,padding:"20px 16px 24px",borderBottom:"1px solid rgba(255,255,255,0.1)"},
  logoText:{fontSize:17,fontWeight:700,color:"#fff"},logoSub:{fontSize:9,color:"#8FBFA6"},
  navItem:{padding:"10px 16px",fontSize:14,display:"flex",alignItems:"center",gap:10,cursor:"pointer",color:"#B8D4C8"},
  navSec:{padding:"10px 16px",fontSize:14,display:"flex",alignItems:"center",gap:10,cursor:"pointer",color:"#B8D4C8",fontWeight:600},
  navSecAct:{backgroundColor:"rgba(255,255,255,0.08)",color:"#fff"},
  navIco:{fontSize:16,width:20,textAlign:"center"},chev:{marginLeft:"auto",fontSize:11,opacity:0.6},chevSm:{marginLeft:"auto",fontSize:10,opacity:0.5},
  navGrp:{padding:"8px 16px 4px 20px",fontSize:10,fontWeight:700,letterSpacing:"0.8px",color:"#6B9E86",textTransform:"uppercase",cursor:"pointer",display:"flex",alignItems:"center"},
  navChild:{padding:"7px 16px 7px 46px",fontSize:13,cursor:"pointer",color:"#A4CBBA",position:"relative"},
  navChildAct:{color:"#fff",backgroundColor:"rgba(255,255,255,0.1)",fontWeight:600},
  activeBar:{position:"absolute",left:0,top:0,bottom:0,width:3,backgroundColor:"#52B788",borderRadius:"0 2px 2px 0"},
  ver:{position:"absolute",bottom:16,left:16,fontSize:11,color:"#5A8A72"},
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 24px",backgroundColor:"#fff",borderBottom:"1px solid #DDD5C9"},
  headerLeft:{display:"flex",alignItems:"center",gap:16},headerRight:{display:"flex",alignItems:"center",gap:16},
  pageTitle:{fontSize:18,fontWeight:700,color:"#1B4332",margin:0},
  headerMeta:{fontSize:13,color:"#888"},
  backBtn:{background:"none",border:"1px solid #DDD5C9",borderRadius:6,fontSize:12,cursor:"pointer",color:"#2D6A4F",fontWeight:600,padding:"6px 14px"},
  orderDropBtn:{display:"flex",alignItems:"center",gap:2,padding:"6px 14px",backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:6,cursor:"pointer",fontSize:14},
  orderDropMenu:{position:"absolute",top:"100%",left:0,minWidth:280,backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:20,overflow:"hidden",marginTop:4},
  orderDropItem:{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f0ece4"},
  orderDropItemAct:{backgroundColor:"#F0F7F4",borderLeft:"3px solid #2D6A4F"},
  stepWrap:{display:"flex",alignItems:"center",padding:"10px 24px",backgroundColor:"#fff",borderBottom:"2px solid #DDD5C9",gap:10},
  chip:{padding:"8px 18px",borderRadius:20,fontSize:13,cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"},
  content:{padding:24,flex:1,overflowY:"auto"},
  alertSuccess:{padding:"12px 16px",backgroundColor:"#E8F5EE",border:"1px solid #A3D9BB",borderRadius:8,color:"#1B4332",fontSize:14,marginBottom:16},
  alertInfo:{padding:"12px 16px",backgroundColor:"#E3F2FD",border:"1px solid #90CAF9",borderRadius:8,color:"#1565C0",fontSize:14,marginBottom:16},
  card:{backgroundColor:"#fff",borderRadius:8,border:"1px solid #DDD5C9",padding:20,marginBottom:16},
  cardHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12},
  cardTitle:{margin:0,fontSize:16,fontWeight:700,color:"#1B4332"},
  cardDesc:{fontSize:13,color:"#666",margin:"0 0 16px",lineHeight:1.5},
  badge:{fontSize:11,padding:"3px 10px",borderRadius:12,backgroundColor:"#EDE8E0",color:"#666",fontWeight:600},
  badgeMuted:{fontSize:11,padding:"2px 8px",borderRadius:10,backgroundColor:"#f0ece4",color:"#999",fontWeight:500},
  partialHint:{fontSize:12,color:"#B8860B",fontStyle:"italic"},
  tplRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px",backgroundColor:"#FAFAF6",borderRadius:6,border:"1px solid #EDE8E0",marginBottom:14},
  tplSelect:{padding:"5px 10px",border:"1px solid #DDD5C9",borderRadius:4,fontSize:13,backgroundColor:"#fff",color:"#333",minWidth:200,cursor:"pointer"},
  tableWrap:{overflowX:"auto"},table:{width:"100%",borderCollapse:"collapse",fontSize:13},
  th:{textAlign:"left",padding:"10px 12px",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",color:"#1B4332",borderBottom:"2px solid #DDD5C9",backgroundColor:"#FAFAF6",whiteSpace:"nowrap"},
  thSm:{textAlign:"left",padding:"6px 10px",fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:"0.4px",color:"#1B4332",borderBottom:"2px solid #DDD5C9",backgroundColor:"#FAFAF6",whiteSpace:"nowrap"},
  td:{padding:"10px 12px",borderBottom:"1px solid #EDE8E0",fontSize:13,color:"#333"},
  tdSm:{padding:"5px 10px",borderBottom:"1px solid #EDE8E0",fontSize:12,color:"#444"},
  trEven:{backgroundColor:"#FAFAF6"},
  fInput:{width:"100%",padding:"7px 10px",border:"1px solid #DDD5C9",borderRadius:4,fontSize:13,fontFamily:"'Fira Code','SF Mono','Consolas',monospace",color:"#1B4332",outline:"none",boxSizing:"border-box",backgroundColor:"#fff"},
  aiChip:{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:3,backgroundColor:"#E3F2FD",color:"#1565C0",cursor:"help",letterSpacing:"0.3px"},
  sugBox:{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:4,boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:10,maxHeight:200,overflowY:"auto"},
  sugItem:{padding:"6px 10px",cursor:"pointer",fontSize:12,borderBottom:"1px solid #f0ece4"},
  sampleResult:{fontSize:12,color:"#2D6A4F",fontWeight:500,padding:"4px 8px",backgroundColor:"#F0F7F4",borderRadius:4,wordBreak:"break-word"},
  sampleEmpty:{fontSize:12,color:"#ccc",fontStyle:"italic"},
  codeSm:{backgroundColor:"#EDE8E0",padding:"1px 5px",borderRadius:3,fontSize:11,fontFamily:"monospace",color:"#1B4332"},
  btnPrimary:{padding:"10px 20px",backgroundColor:"#2D6A4F",color:"#fff",border:"none",borderRadius:6,fontSize:14,fontWeight:600,cursor:"pointer"},
  btnPrimarySm:{padding:"6px 14px",backgroundColor:"#2D6A4F",color:"#fff",border:"none",borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer"},
  btnOutline:{padding:"10px 20px",backgroundColor:"#fff",color:"#555",border:"1px solid #ccc",borderRadius:6,fontSize:14,fontWeight:500,cursor:"pointer"},
  btnOutlineSm:{padding:"5px 12px",backgroundColor:"#fff",color:"#2D6A4F",border:"1px solid #2D6A4F",borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5},
  btnOutlineWarn:{padding:"6px 14px",backgroundColor:"#fff",color:"#c0392b",border:"1px solid #c0392b",borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4},
  btnDanger:{padding:"10px 20px",backgroundColor:"#c0392b",color:"#fff",border:"none",borderRadius:6,fontSize:14,fontWeight:600,cursor:"pointer"},
  btnTextDanger:{background:"none",border:"none",color:"#c0392b",fontSize:12,fontWeight:600,cursor:"pointer",padding:"4px 8px"},
  btnSmOut:{padding:"5px 10px",backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",color:"#555"},
  microBtn:{width:22,height:22,borderRadius:3,border:"1px solid #DDD5C9",backgroundColor:"#FAFAF6",cursor:"pointer",fontSize:12,fontWeight:700,color:"#555",display:"flex",alignItems:"center",justifyContent:"center",padding:0},
  applyBtn:{fontSize:10,padding:"1px 6px",borderRadius:3,border:"1px solid #2D6A4F",backgroundColor:"#E8F5EE",color:"#2D6A4F",fontWeight:600,cursor:"pointer"},
  spinner:{display:"inline-block",width:12,height:12,border:"2px solid #ccc",borderTop:"2px solid #2D6A4F",borderRadius:"50%",animation:"spin 0.6s linear infinite"},
  btnTog:{padding:"5px 12px",border:"1px solid #DDD5C9",borderRadius:4,fontSize:12,fontWeight:500,cursor:"pointer",backgroundColor:"#fff",color:"#555"},
  btnTogAct:{padding:"5px 12px",border:"1px solid #2D6A4F",borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer",backgroundColor:"#E8F5EE",color:"#2D6A4F"},
  cleanGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20},
  cleanCard:{border:"1px solid #DDD5C9",borderRadius:8,padding:24,display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"},
  cleanIcon:{width:48,height:48,borderRadius:"50%",backgroundColor:"#F0F7F4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#2D6A4F",fontWeight:700},
  cleanTitle:{margin:0,fontSize:15,fontWeight:700,color:"#1B4332"},
  fileName:{fontFamily:"monospace",fontSize:13,color:"#2D6A4F",backgroundColor:"#F0F7F4",padding:"4px 12px",borderRadius:4,fontWeight:600},
  chipRow:{display:"flex",gap:6},chipInfo:{fontSize:11,padding:"2px 8px",borderRadius:10,backgroundColor:"#E3F2FD",color:"#1565C0",fontWeight:500},
  chipSuccess:{fontSize:11,padding:"2px 8px",borderRadius:10,backgroundColor:"#E8F5EE",color:"#2D6A4F",fontWeight:500},
  chipWarn:{fontSize:11,padding:"2px 8px",borderRadius:10,backgroundColor:"#FFF3E0",color:"#B8860B",fontWeight:500},
  dropZone:{border:"2px dashed #B8D4C8",borderRadius:8,padding:"18px 24px",cursor:"pointer",fontSize:13,color:"#666",width:"100%",boxSizing:"border-box"},
  dropZoneAct:{borderColor:"#2D6A4F",backgroundColor:"#F0F7F4"},
  uploadedBadge:{fontSize:14,fontWeight:600,color:"#2D6A4F",padding:"8px 16px",backgroundColor:"#D4EDDA",borderRadius:6},
  logBox:{marginTop:16,padding:12,backgroundColor:"#f9f9f7",borderRadius:6,border:"1px solid #EDE8E0",fontFamily:"monospace",fontSize:11},
  logLine:{padding:"2px 0"},logTs:{color:"#aaa",marginRight:8},
  summaryRow:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"},
  sumChip:{padding:"8px 14px",backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:8,display:"flex",flexDirection:"column",gap:2,minWidth:80},
  sumLabel:{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.4px",color:"#888"},
  sumVal:{fontSize:18,fontWeight:700,color:"#1B4332"},
  ctrlStrip:{display:"flex",gap:8,alignItems:"center",padding:"10px 16px",backgroundColor:"#fff",borderRadius:8,border:"1px solid #DDD5C9",marginBottom:16},
  searchInput:{padding:"6px 12px",border:"1px solid #DDD5C9",borderRadius:4,fontSize:13,width:200,outline:"none"},
  catTag:{fontSize:11,padding:"2px 8px",borderRadius:3,backgroundColor:"#EDE8E0",color:"#555",fontWeight:500,whiteSpace:"nowrap"},
  condSel:{padding:"3px 6px",borderRadius:3,border:"1px solid #DDD5C9",fontSize:11,backgroundColor:"#fff"},
  vsChip:{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10},
  inlineInput:{width:"100%",padding:"4px 8px",border:"2px solid #2D6A4F",borderRadius:4,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  overlay:{position:"fixed",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000},
  modal:{backgroundColor:"#fff",borderRadius:12,padding:32,maxWidth:440,width:"90%",textAlign:"center"},
  modalTitle:{fontSize:18,fontWeight:700,color:"#1B4332",margin:"0 0 8px"},
  modalText:{fontSize:14,color:"#555",lineHeight:1.5,margin:"0 0 20px"},
  modalActions:{display:"flex",gap:12,justifyContent:"center"},
};
