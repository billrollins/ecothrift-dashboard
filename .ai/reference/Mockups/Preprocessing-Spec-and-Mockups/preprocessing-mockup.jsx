import { useState } from "react";

const MOCK_ORDER = { id: "C5TC0-OM1-A8R3", vendor: "Costco", description: "2 Pallets of Small Kitchen Appliances, Food Storage, Grill & More", manifestId: "OWA-66276645", condition: "Used - Fair", units: 80, retailEst: "$6,838" };

const RAW_HEADERS = ["raw_title","raw_qty","raw_retail","raw_condition","raw_category","raw_upc","raw_brand"];
const RAW_SAMPLE_ROWS = [
  { raw_title:"NINJA BLNDR PRO 1000W BLK", raw_qty:"3", raw_retail:"89.99", raw_condition:"Used - Good", raw_category:"Kitchen", raw_upc:"622356561234", raw_brand:"Ninja" },
  { raw_title:"INSTPOT DUO 7IN1 6QT PRSSR", raw_qty:"2", raw_retail:"79.99", raw_condition:"Used - Fair", raw_category:"Kitchen", raw_upc:"853084004001", raw_brand:"Instant Pot" },
  { raw_title:"CUISNRT 14C FD PROCESSOR SS", raw_qty:"1", raw_retail:"199.99", raw_condition:"Used - Good", raw_category:"Kitchen", raw_upc:"086279187123", raw_brand:"Cuisinart" },
  { raw_title:"KEURIG K-ELITE BRWR BRSHED SLT", raw_qty:"4", raw_retail:"169.99", raw_condition:"Used - Fair", raw_category:"Kitchen", raw_upc:"611247394523", raw_brand:"Keurig" },
  { raw_title:"HAMBEACH TOASTR OVN 6SLC SS", raw_qty:"5", raw_retail:"49.99", raw_condition:"Used - Good", raw_category:"Kitchen", raw_upc:"040094922345", raw_brand:"Hamilton Beach" },
];

const TEMPLATES_MATCHING = [
  { id:1, name:"Costco - Standard Pallet", lastUsed:"Apr 15, 2026", uses:23 },
  { id:2, name:"Costco - Apparel Lot", lastUsed:"Mar 22, 2026", uses:8 },
  { id:3, name:"Costco - Electronics", lastUsed:"Feb 10, 2026", uses:4 },
];

const STANDARD_FIELDS = [
  { key:"description", label:"Description", required:true },
  { key:"retail_value", label:"Retail Cost", required:true },
  { key:"quantity", label:"Quantity", required:false },
  { key:"title", label:"Title", required:false },
  { key:"brand", label:"Brand", required:false },
  { key:"model", label:"Model", required:false },
  { key:"category", label:"Category", required:false },
  { key:"condition", label:"Condition", required:false },
  { key:"upc", label:"UPC", required:false },
  { key:"vendor_item_number", label:"Vendor Item #", required:false },
  { key:"notes", label:"Notes", required:false },
];

const AI_FORMULAS = {
  description:{formula:"TITLE([raw_title])",reasoning:"raw_title contains product description, TITLE for readability"},
  retail_value:{formula:"[raw_retail]",reasoning:"raw_retail maps directly, already numeric"},
  quantity:{formula:"[raw_qty]",reasoning:"raw_qty is the quantity field"},
  title:{formula:"TITLE([raw_title])",reasoning:"Same source as description, title-cased"},
  brand:{formula:"TITLE([raw_brand])",reasoning:"raw_brand contains brand names"},
  model:{formula:"",reasoning:""},
  category:{formula:"[raw_category]",reasoning:"Direct mapping"},
  condition:{formula:"[raw_condition]",reasoning:"Direct mapping"},
  upc:{formula:"[raw_upc]",reasoning:"Direct mapping from barcode field"},
  vendor_item_number:{formula:"",reasoning:""},
  notes:{formula:"",reasoning:""},
};

// Simulate running a formula on the first sample row
const simulateFormula = (formula, row) => {
  if (!formula.trim()) return "";
  // Extract [header] references
  let result = formula;
  const headerMatches = formula.match(/\[([^\]]+)\]/g);
  if (!headerMatches) return "";
  headerMatches.forEach(match => {
    const header = match.slice(1,-1);
    result = result.replace(match, row[header] || "");
  });
  // Simulate functions
  if (result.startsWith("TITLE(")) { const inner = result.slice(6,-1); result = inner.split(" ").map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(" "); }
  else if (result.startsWith("UPPER(")) { result = result.slice(6,-1).toUpperCase(); }
  else if (result.startsWith("LOWER(")) { result = result.slice(6,-1).toLowerCase(); }
  else if (result.startsWith("TRIM(")) { result = result.slice(5,-1).trim(); }
  return result;
};

const STANDARDIZED_PREVIEW = [
  { row:1, description:"Ninja Blndr Pro 1000W Blk", retail_value:"89.99", quantity:"3", brand:"Ninja", category:"Kitchen", condition:"Used - Good", upc:"622356561234" },
  { row:2, description:"Instpot Duo 7In1 6Qt Prssr", retail_value:"79.99", quantity:"2", brand:"Instant Pot", category:"Kitchen", condition:"Used - Fair", upc:"853084004001" },
  { row:3, description:"Cuisnrt 14C Fd Processor Ss", retail_value:"199.99", quantity:"1", brand:"Cuisinart", category:"Kitchen", condition:"Used - Good", upc:"086279187123" },
  { row:4, description:"Keurig K-Elite Brwr Brshed Slt", retail_value:"169.99", quantity:"4", brand:"Keurig", category:"Kitchen", condition:"Used - Fair", upc:"611247394523" },
  { row:5, description:"Hambeach Toastr Ovn 6Slc Ss", retail_value:"49.99", quantity:"5", brand:"Hamilton Beach", category:"Kitchen", condition:"Used - Good", upc:"040094922345" },
];

const STANDARDIZED_ROWS = [
  { id:1, title:"Ninja Blndr Pro 1000W Blk", qty:3, retail:89.99, condition:"Used - Good", category:"Kitchen", ai_title:"Ninja Professional Blender 1000W - Black", ai_brand:"Ninja", ai_model:"BL610", ai_category:"Small Kitchen Appliances", proposed_price:44.99 },
  { id:2, title:"Instpot Duo 7In1 6Qt Prssr", qty:2, retail:79.99, condition:"Used - Fair", category:"Kitchen", ai_title:"Instant Pot Duo 7-in-1 6Qt Pressure Cooker", ai_brand:"Instant Pot", ai_model:"DUO60", ai_category:"Small Kitchen Appliances", proposed_price:34.99 },
  { id:3, title:"Cuisnrt 14C Fd Processor Ss", qty:1, retail:199.99, condition:"Used - Good", category:"Kitchen", ai_title:"Cuisinart 14-Cup Food Processor - Stainless Steel", ai_brand:"Cuisinart", ai_model:"DFP-14BCWNY", ai_category:"Small Kitchen Appliances", proposed_price:89.99 },
  { id:4, title:"Keurig K-Elite Brwr Brshed Slt", qty:4, retail:169.99, condition:"Used - Fair", category:"Kitchen", ai_title:"Keurig K-Elite Single Serve Brewer - Brushed Slate", ai_brand:"Keurig", ai_model:"K-Elite", ai_category:"Coffee & Espresso", proposed_price:74.99 },
  { id:5, title:"Hambeach Toastr Ovn 6Slc Ss", qty:5, retail:49.99, condition:"Used - Good", category:"Kitchen", ai_title:"Hamilton Beach 6-Slice Toaster Oven - Stainless Steel", ai_brand:"Hamilton Beach", ai_model:"31127D", ai_category:"Small Kitchen Appliances", proposed_price:22.99 },
];

const NAV_INBOUND = ["Orders","Preprocessing","Receiving","Processing","Finalization","Disputes"];

function Sidebar({activeItem}){
  const [expanded,setExpanded] = useState({HR:false,Inventory:true,INBOUND:true});
  const toggle = k => setExpanded(p=>({...p,[k]:!p[k]}));
  return (
    <div style={st.sidebar}>
      <div style={st.logo}><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 3 L8 10 Q6 13 8 16 L14 24 L20 16 Q22 13 20 10 Z" fill="#52B788" opacity="0.8"/><path d="M14 6 L10 11 Q9 13 10 15 L14 20 L18 15 Q19 13 18 11 Z" fill="#2D6A4F"/></svg><div><div style={st.logoText}>Eco-Thrift</div><div style={st.logoSub}>another chance for everything & everyone</div></div></div>
      <div style={st.navItem}><span style={st.navIco}>▦</span>Dashboard</div>
      <div style={st.navSection} onClick={()=>toggle("HR")}><span style={st.navIco}>👤</span>HR<span style={st.chev}>{expanded.HR?"▾":"▸"}</span></div>
      {expanded.HR&&["Time Clock","Time History","Employees","Sick Leave"].map(i=><div key={i} style={st.navChild}>{i}</div>)}
      <div style={{...st.navSection,...st.navSecActive}} onClick={()=>toggle("Inventory")}><span style={st.navIco}>📦</span>Inventory<span style={st.chev}>{expanded.Inventory?"▾":"▸"}</span></div>
      {expanded.Inventory&&<>
        <div style={st.navGroup} onClick={()=>toggle("INBOUND")}>INBOUND FULFILLMENT<span style={st.chevSm}>{expanded.INBOUND?"▾":"▸"}</span></div>
        {expanded.INBOUND&&NAV_INBOUND.map(i=><div key={i} style={{...st.navChild,...(i===activeItem?st.navChildActive:{})}}>{i===activeItem&&<div style={st.activeBar}/>}{i}</div>)}
        <div style={st.navGroup}>ITEMS<span style={st.chevSm}>▸</span></div>
        <div style={st.navGroup}>VENDORS<span style={st.chevSm}>▸</span></div>
      </>}
      <div style={st.version}>v2.20.0</div>
    </div>
  );
}

function Stepper({current,onStep,completedStep}){
  const steps=[{num:0,label:"Standardize Manifest"},{num:1,label:"AI Cleanup"},{num:2,label:"Manual Review"}];
  const getState=idx=>{if(idx===current)return"selected";if(idx<=completedStep)return"done";if(idx===completedStep+1)return"ready";return"notReady";};
  const cs=state=>{const b={...st.chip};if(state==="selected")return{...b,backgroundColor:"#2D6A4F",color:"#fff",fontWeight:700,border:"2px solid #2D6A4F"};if(state==="done")return{...b,backgroundColor:"#52B788",color:"#fff",fontWeight:600,border:"2px solid #52B788"};if(state==="ready")return{...b,backgroundColor:"#E3F2FD",color:"#1565C0",fontWeight:600,border:"2px solid #90CAF9",animation:"pulse 2s infinite"};return{...b,backgroundColor:"transparent",color:"#aaa",border:"2px solid #ddd",opacity:0.5,cursor:"default"};};
  return(<div style={st.stepperWrap}><style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(21,101,192,0.15)}50%{box-shadow:0 0 0 6px rgba(21,101,192,0.08)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>{steps.map((s,i)=><div key={s.num} onClick={()=>s.num<=completedStep+1&&onStep(s.num)} style={cs(getState(s.num))}>{getState(s.num)==="done"?"✓ ":""}{i+1}. {s.label}</div>)}</div>);
}

function ConfirmModal({title,message,confirmLabel,onConfirm,onCancel,danger}){
  return(<div style={st.overlay}><div style={st.modal}><div style={{fontSize:32,marginBottom:8}}>{danger?"⚠️":"ℹ️"}</div><h3 style={st.modalTitle}>{title}</h3><p style={st.modalText}>{message}</p><div style={st.modalActions}><button style={st.btnOutline} onClick={onCancel}>Cancel</button><button style={danger?st.btnDanger:st.btnPrimary} onClick={onConfirm}>{confirmLabel}</button></div></div></div>);
}

// ─── STEP 1 ──────────────────────────────────────────────
function Step1Standardize({onStandardize,isDone,onUndo}){
  const [selectedTemplateId,setSelectedTemplateId] = useState(TEMPLATES_MATCHING[0].id);
  const [templateDropdownOpen,setTemplateDropdownOpen] = useState(false);
  const [isCustom,setIsCustom] = useState(false);
  const [templateName,setTemplateName] = useState(TEMPLATES_MATCHING[0].name);
  const [formulas,setFormulas] = useState(()=>{const o={};STANDARD_FIELDS.forEach(f=>{o[f.key]="";});return o;});
  const [savedFormulas,setSavedFormulas] = useState(null); // snapshot after AI/template load
  const [aiReasonings,setAiReasonings] = useState({});
  const [aiLoading,setAiLoading] = useState(false);
  const [showRawRef,setShowRawRef] = useState(false);
  const [showPreview,setShowPreview] = useState(false);
  const [showConfirm,setShowConfirm] = useState(null);
  const [showNewTemplateModal,setShowNewTemplateModal] = useState(false);
  const [pendingFormulaChange,setPendingFormulaChange] = useState(null); // {key, value}
  const [focusedField,setFocusedField] = useState(null);

  const FUNCTIONS = ["UPPER","LOWER","TITLE","TRIM","REPLACE","CONCAT","LEFT","RIGHT"];
  const hasDesc = formulas.description.trim()!=="";
  const hasRetail = formulas.retail_value.trim()!=="";
  const hasAny = Object.values(formulas).some(v=>v.trim()!=="");
  let step1State = "clear";
  if(isDone) step1State="done"; else if(hasDesc&&hasRetail) step1State="ready"; else if(hasAny) step1State="partial";

  const selectedTemplate = TEMPLATES_MATCHING.find(t=>t.id===selectedTemplateId);

  const handleAISuggest = ()=>{
    setAiLoading(true);
    setTimeout(()=>{
      const nf={};const nr={};
      STANDARD_FIELDS.forEach(f=>{nf[f.key]=AI_FORMULAS[f.key]?.formula||"";if(AI_FORMULAS[f.key]?.reasoning)nr[f.key]=AI_FORMULAS[f.key].reasoning;});
      setFormulas(nf);setSavedFormulas({...nf});setAiReasonings(nr);setAiLoading(false);
    },1500);
  };

  const handleClearFormulas = ()=>{const c={};STANDARD_FIELDS.forEach(f=>{c[f.key]="";});setFormulas(c);setAiReasonings({});setSavedFormulas(null);};

  const handleFormulaChange = (key,val)=>{
    // If we have saved formulas (from template) and user is changing, warn
    if(savedFormulas && savedFormulas[key]!==val && !isCustom){
      setPendingFormulaChange({key,val});
      setShowNewTemplateModal(true);
    } else {
      setFormulas(prev=>({...prev,[key]:val}));
    }
  };

  const confirmNewTemplate = ()=>{
    setIsCustom(true);
    setTemplateName("Custom (unsaved)");
    if(pendingFormulaChange){
      setFormulas(prev=>({...prev,[pendingFormulaChange.key]:pendingFormulaChange.val}));
    }
    setPendingFormulaChange(null);
    setShowNewTemplateModal(false);
  };

  const keepOldTemplate = ()=>{
    setPendingFormulaChange(null);
    setShowNewTemplateModal(false);
  };

  const handleSelectTemplate = (t)=>{
    setSelectedTemplateId(t.id);
    setTemplateName(t.name);
    setIsCustom(false);
    setTemplateDropdownOpen(false);
    // In real app, this would load the template's formulas
  };

  const handleStandardize = ()=>{if(isDone){setShowConfirm("restandardize");}else{onStandardize();setShowPreview(true);}};

  const getSuggestions = formula=>{
    if(!formula) return [];
    const lb=formula.lastIndexOf("[");
    if(lb>=0&&formula.indexOf("]",lb)===-1){const p=formula.slice(lb+1).toLowerCase();return RAW_HEADERS.filter(h=>h.toLowerCase().includes(p)).map(h=>`[${h}]`);}
    const parts=formula.split(/[\[\]()]/);const last=(parts[parts.length-1]||"").trim().toUpperCase();
    if(last.length>0) return FUNCTIONS.filter(f=>f.startsWith(last));
    return [];
  };

  const sampleRow = RAW_SAMPLE_ROWS[0];

  return (
    <div>
      {isDone && <div style={st.alertSuccess}><span style={{fontWeight:700}}>✓ Standardization complete</span> - {RAW_SAMPLE_ROWS.length} row(s) created.</div>}

      {/* Action bar: AI + toolbar + standardize */}
      <div style={st.actionBar}>
        <div style={st.actionBarLeft}>
          {step1State!=="clear"&&!isDone && <button style={st.btnTextDanger} onClick={handleClearFormulas}>Clear Formulas</button>}
          <button style={{...st.btnOutlineSm,opacity:aiLoading?0.6:1}} onClick={handleAISuggest} disabled={aiLoading}>
            {aiLoading?<><span style={st.spinner}/> AI analyzing...</>:<><span style={{fontSize:16}}>✦</span> Use AI</>}
          </button>
        </div>
        <div style={st.actionBarRight}>
          {isDone && <button style={st.btnOutlineWarn} onClick={()=>setShowConfirm("undo")}>🗑 Undo</button>}
          {(step1State==="ready"||step1State==="done") && <button style={st.btnPrimary} onClick={handleStandardize}>{isDone?"Re-standardize":"Standardize"}</button>}
          {step1State==="partial" && <div style={st.partialHint}>Fill required fields (Description, Retail Cost) to standardize</div>}
        </div>
      </div>

      {/* Formula Mappings Card */}
      <div style={st.card}>
        <div style={st.cardHeader}>
          <h3 style={st.cardTitle}>Formula Mappings</h3>
          <span style={st.badge}>{STANDARD_FIELDS.length} fields</span>
        </div>

        {/* Template selector row */}
        <div style={st.templateRow}>
          <div style={st.templateSelectorWrap}>
            <span style={{fontSize:13,color:"#555",fontWeight:500}}>Template:</span>
            <div style={{position:"relative"}}>
              <button
                style={st.templateDropdownBtn}
                onClick={()=>setTemplateDropdownOpen(!templateDropdownOpen)}
              >
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
                  <span style={{fontSize:13,fontWeight:600,color:"#1B4332"}}>{templateName}</span>
                  {!isCustom && <span style={{fontSize:10,color:"#888"}}>
                    Matches {TEMPLATES_MATCHING.length} template{TEMPLATES_MATCHING.length!==1?"s":""}
                  </span>}
                  {isCustom && <span style={{fontSize:10,color:"#B8860B"}}>Modified from saved template</span>}
                </div>
                <span style={{fontSize:11,color:"#888",marginLeft:8}}>▾</span>
              </button>

              {templateDropdownOpen && (
                <div style={st.templateDropdown}>
                  <div style={st.templateDropdownHeader}>
                    {TEMPLATES_MATCHING.length} templates match this signature
                  </div>
                  {TEMPLATES_MATCHING.map(t=>(
                    <div
                      key={t.id}
                      style={{
                        ...st.templateDropdownItem,
                        ...(t.id===selectedTemplateId&&!isCustom ? st.templateDropdownItemActive : {}),
                      }}
                      onClick={()=>handleSelectTemplate(t)}
                    >
                      <div style={{fontWeight:600,fontSize:13,color:"#1B4332"}}>{t.name}</div>
                      <div style={{fontSize:11,color:"#888"}}>Last used {t.lastUsed} · {t.uses} uses</div>
                    </div>
                  ))}
                  <div
                    style={st.templateDropdownItem}
                    onClick={()=>{setIsCustom(true);setTemplateName("New Template");setTemplateDropdownOpen(false);}}
                  >
                    <div style={{fontWeight:600,fontSize:13,color:"#2D6A4F"}}>+ Create New Template</div>
                    <div style={{fontSize:11,color:"#888"}}>Start from scratch</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {isCustom && (
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:12,color:"#555"}}>Name:</span>
              <input
                style={st.templateNameInput}
                value={templateName}
                onChange={e=>setTemplateName(e.target.value)}
                placeholder="Template name..."
              />
            </div>
          )}
        </div>

        {/* Formula grid */}
        <div style={st.tableWrap}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={{...st.th,width:150}}>Standard Field</th>
                <th style={st.th}>Formula Expression</th>
                <th style={{...st.th,width:220}}>Sample Result (Row 1)</th>
              </tr>
            </thead>
            <tbody>
              {STANDARD_FIELDS.map((field,i)=>{
                const suggestions = focusedField===field.key ? getSuggestions(formulas[field.key]) : [];
                const sampleResult = simulateFormula(formulas[field.key], sampleRow);
                return (
                  <tr key={field.key} style={i%2===0?st.trEven:{}}>
                    <td style={st.td}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <span style={{fontWeight:600,color:"#1B4332",fontSize:13}}>
                          {field.label}{field.required&&<span style={{color:"#c0392b"}}> *</span>}
                        </span>
                        {aiReasonings[field.key]&&<span style={st.aiChip} title={aiReasonings[field.key]}>AI</span>}
                      </div>
                      <div style={{fontSize:10,color:"#aaa",fontFamily:"monospace"}}>{field.key}</div>
                    </td>
                    <td style={{...st.td,position:"relative"}}>
                      <input
                        style={{
                          ...st.formulaInput,
                          ...(isDone?{backgroundColor:"#f5f5f5",color:"#888"}:{}),
                          borderColor:field.required&&!formulas[field.key].trim()&&!isDone?"#e8c4a0":"#DDD5C9",
                        }}
                        value={formulas[field.key]}
                        onChange={e=>handleFormulaChange(field.key,e.target.value)}
                        onFocus={()=>setFocusedField(field.key)}
                        onBlur={()=>setTimeout(()=>setFocusedField(null),150)}
                        placeholder={`e.g. TITLE([${RAW_HEADERS[0]}])`}
                        disabled={isDone}
                      />
                      {suggestions.length>0&&<div style={st.suggestBox}>{suggestions.slice(0,8).map((sg,si)=>(
                        <div key={si} style={st.suggestItem} onMouseDown={e=>{e.preventDefault();const val=formulas[field.key];const lb=val.lastIndexOf("[");if(sg.startsWith("[")){handleFormulaChange(field.key,val.slice(0,lb)+sg);}else{handleFormulaChange(field.key,sg+"(");}}}><code style={{fontSize:12}}>{sg}</code></div>
                      ))}</div>}
                    </td>
                    <td style={st.td}>
                      {sampleResult ? (
                        <div style={st.sampleResult}>{sampleResult}</div>
                      ) : (
                        <div style={st.sampleEmpty}>--</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw column ref */}
      <div style={st.card}>
        <div style={{...st.cardHeader,cursor:"pointer",userSelect:"none"}} onClick={()=>setShowRawRef(!showRawRef)}>
          <h3 style={{...st.cardTitle,fontSize:14}}>{showRawRef?"▾":"▸"} Raw Column Reference ({RAW_HEADERS.length} columns)</h3>
          <span style={st.badgeMuted}>Sample data</span>
        </div>
        {showRawRef&&<div style={{...st.tableWrap,marginTop:8}}><table style={st.table}><thead><tr><th style={{...st.thSm,width:40}}>Row</th>{RAW_HEADERS.map(h=><th key={h} style={st.thSm}>{h}</th>)}</tr></thead><tbody>{RAW_SAMPLE_ROWS.map((row,i)=><tr key={i} style={i%2===0?st.trEven:{}}><td style={st.tdSm}>{i+1}</td>{RAW_HEADERS.map(h=><td key={h} style={st.tdSm}>{row[h]}</td>)}</tr>)}</tbody></table></div>}
      </div>

      {/* Standardized preview */}
      {isDone&&<div style={st.card}>
        <div style={{...st.cardHeader,cursor:"pointer",userSelect:"none"}} onClick={()=>setShowPreview(!showPreview)}>
          <h3 style={{...st.cardTitle,fontSize:14}}>{showPreview?"▾":"▸"} Standardization Preview</h3>
          <span style={st.badge}>{STANDARDIZED_PREVIEW.length} rows / {MOCK_ORDER.units} total</span>
        </div>
        <div style={{fontSize:12,color:"#888",margin:"4px 0 0"}}>Preview loads once after Standardize saves staged rows.</div>
        {showPreview&&<div style={{...st.tableWrap,marginTop:12,maxHeight:400,overflowY:"auto"}}><table style={st.table}><thead style={{position:"sticky",top:0,zIndex:1}}><tr><th style={{...st.thSm,width:40}}>Row</th><th style={st.thSm}>Description</th><th style={st.thSm}>Retail</th><th style={st.thSm}>Qty</th><th style={st.thSm}>Brand</th><th style={st.thSm}>Category</th><th style={st.thSm}>Condition</th><th style={st.thSm}>UPC</th></tr></thead>
          <tbody>{STANDARDIZED_PREVIEW.map((r,i)=><tr key={i} style={i%2===0?st.trEven:{}}><td style={st.tdSm}>{r.row}</td><td style={{...st.tdSm,fontWeight:500,color:"#1B4332"}}>{r.description}</td><td style={st.tdSm}>${r.retail_value}</td><td style={st.tdSm}>{r.quantity}</td><td style={st.tdSm}>{r.brand}</td><td style={st.tdSm}>{r.category}</td><td style={st.tdSm}>{r.condition}</td><td style={{...st.tdSm,fontFamily:"monospace",fontSize:11}}>{r.upc}</td></tr>)}</tbody></table></div>}
      </div>}

      {/* Modals */}
      {showConfirm==="undo"&&<ConfirmModal title="Undo Standardization" message="This will delete all preprocessing rows and clear staged data. AI cleanup and manual review data will also be removed. This cannot be undone." confirmLabel="Delete & Undo" danger onConfirm={()=>{setShowConfirm(null);onUndo();}} onCancel={()=>setShowConfirm(null)}/>}
      {showConfirm==="restandardize"&&<ConfirmModal title="Re-standardize Manifest" message="This will rebuild all preprocessing rows. Any AI cleanup data and manual review changes will be reset." confirmLabel="Re-standardize" onConfirm={()=>{setShowConfirm(null);onStandardize();setShowPreview(true);}} onCancel={()=>setShowConfirm(null)}/>}
      {showNewTemplateModal&&<div style={st.overlay}><div style={st.modal}>
        <div style={{fontSize:32,marginBottom:8}}>📋</div>
        <h3 style={st.modalTitle}>Create New Template?</h3>
        <p style={st.modalText}>You're modifying a formula from the saved template "{selectedTemplate?.name}". Do you want to create a new template with your changes, or revert to the saved version?</p>
        <div style={st.modalActions}>
          <button style={st.btnOutline} onClick={keepOldTemplate}>Revert Change</button>
          <button style={st.btnPrimary} onClick={confirmNewTemplate}>Create New Template</button>
        </div>
      </div></div>}
    </div>
  );
}

// ─── STEP 2 ──────────────────────────────────────────────
function Step2Cleanup({orderNumber,onUpload,isUploaded,standardizedCount}){
  const [dragOver,setDragOver] = useState(false);
  const [uploadLog,setUploadLog] = useState([]);
  const handleUpload = ()=>{setUploadLog([{level:"info",msg:`Parsing ${orderNumber}-cleaned.csv...`,ts:"12:34:01"},{level:"info",msg:"Validating columns: row_id, ai_title, ai_brand, ai_model, category, condition, proposed_price",ts:"12:34:02"},{level:"success",msg:`${STANDARDIZED_ROWS.length} rows matched and updated.`,ts:"12:34:03"}]);onUpload();};
  return (
    <div>
      {isUploaded&&<div style={st.alertSuccess}><span style={{fontWeight:700}}>✓ AI Cleanup complete</span> - all {STANDARDIZED_ROWS.length} row(s) cleaned.</div>}
      <div style={st.card}>
        <div style={st.cardHeader}><h3 style={st.cardTitle}>Offline AI Cleanup</h3></div>
        <p style={st.cardDesc}>Download the standardized rows as CSV, run through your AI cleanup externally, then upload back. Expected columns: <code style={st.codeSm}>row_id, ai_title, ai_brand, ai_model, category, condition, proposed_price</code></p>
        <div style={st.cleanGrid}>
          <div style={st.cleanCard}>
            <div style={st.cleanIcon}>↓</div>
            <h4 style={st.cleanTitle}>Download Cleanup CSV</h4>
            <div style={st.fileName}>{orderNumber}.csv</div>
            <div style={st.chipRow}><span style={st.chipInfo}>{standardizedCount} rows</span></div>
            <button style={st.btnPrimary} onClick={()=>alert(`Downloading ${orderNumber}.csv`)}>Download CSV</button>
          </div>
          <div style={st.cleanCard}>
            <div style={{...st.cleanIcon,color:isUploaded?"#2D6A4F":"#B8860B"}}>{isUploaded?"✓":"↑"}</div>
            <h4 style={st.cleanTitle}>Upload Completed CSV</h4>
            <div style={st.fileName}>{orderNumber}-cleaned.csv</div>
            <div style={st.chipRow}>{isUploaded?<span style={st.chipSuccess}>{STANDARDIZED_ROWS.length} cleaned</span>:<span style={st.chipWarn}>0 imported</span>}</div>
            {isUploaded?<div style={st.uploadedBadge}>✓ Upload Complete</div>:<div style={{...st.dropZone,...(dragOver?st.dropZoneActive:{})}} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);handleUpload();}} onClick={handleUpload}>Drop CSV here or click to browse</div>}
          </div>
        </div>
        {uploadLog.length>0&&<div style={st.logBox}>{uploadLog.map((l,i)=><div key={i} style={{...st.logLine,color:l.level==="success"?"#2D6A4F":l.level==="error"?"#c0392b":"#666"}}><span style={st.logTs}>{l.ts}</span>{l.msg}</div>)}</div>}
      </div>
    </div>
  );
}

// ─── STEP 3 ──────────────────────────────────────────────
function Step3Review({completedStep}){
  const [rows,setRows] = useState(STANDARDIZED_ROWS.map(r=>({...r,final_price:r.proposed_price,dirty:false})));
  const [editingCell,setEditingCell] = useState(null);
  const [searchTerm,setSearchTerm] = useState("");
  const [showMissingOnly,setShowMissingOnly] = useState(false);
  const [showFinalizeConfirm,setShowFinalizeConfirm] = useState(false);
  const missingCount = rows.filter(r=>!r.final_price||r.final_price<=0).length;
  const dirtyCount = rows.filter(r=>r.dirty).length;
  const totalPaid = rows.reduce((s,r)=>s+(r.retail*r.qty),0);
  const totalIdeal = rows.reduce((s,r)=>s+((r.proposed_price||0)*r.qty),0);
  const totalSet = rows.reduce((s,r)=>s+((r.final_price||0)*r.qty),0);
  const totalUnits = rows.reduce((s,r)=>s+r.qty,0);
  const vsIdeal = totalIdeal>0?((totalSet/totalIdeal)*100).toFixed(0):0;
  const filtered = rows.filter(r=>{if(showMissingOnly&&r.final_price&&r.final_price>0)return false;if(searchTerm&&!r.ai_title.toLowerCase().includes(searchTerm.toLowerCase()))return false;return true;});
  const updateRow = (id,f,v)=>{setRows(p=>p.map(r=>r.id===id?{...r,[f]:v,dirty:true}:r));};
  const bulkAdj = (factor)=>{
    const ids=new Set(filtered.map(r=>r.id));
    setRows(p=>p.map(r=>ids.has(r.id)?{...r,final_price:Math.round(((r.final_price??0)*factor)*100)/100,dirty:true}:r));
  };
  const visToIdeal = ()=>{const ids=new Set(filtered.map(r=>r.id));setRows(p=>p.map(r=>ids.has(r.id)?{...r,final_price:r.proposed_price,dirty:true}:r));};

  return (
    <div>
      {completedStep>=2&&missingCount===0&&<div style={st.alertSuccess}><span style={{fontWeight:700}}>✓ Manual review complete</span> - all staged rows priced.</div>}
      <div style={st.summaryRow}>
        <div style={st.summaryChip}><span style={st.summaryLabel}>Paid</span><span style={st.summaryVal}>${totalPaid.toFixed(0)}</span></div>
        <div style={st.summaryChip}><span style={st.summaryLabel}>Ideal</span><span style={st.summaryVal}>${totalIdeal.toFixed(0)}</span></div>
        <div style={st.summaryChip}><span style={st.summaryLabel}>Set</span><span style={{...st.summaryVal,color:"#2D6A4F"}}>${totalSet.toFixed(0)}</span></div>
        <div style={st.summaryChip}><span style={st.summaryLabel}>% vs Ideal</span><span style={st.summaryVal}>{vsIdeal}%</span></div>
        <div style={st.summaryChip}><span style={st.summaryLabel}>Units</span><span style={st.summaryVal}>{totalUnits}</span></div>
        <div style={{...st.summaryChip,borderColor:missingCount>0?"#e8a83e":"#52B788"}}><span style={st.summaryLabel}>Missing Price</span><span style={{...st.summaryVal,color:missingCount>0?"#c0392b":"#2D6A4F"}}>{missingCount}</span></div>
        {dirtyCount>0&&<div style={{...st.summaryChip,borderColor:"#e8a83e"}}><span style={st.summaryLabel}>Unsaved</span><span style={{...st.summaryVal,color:"#B8860B"}}>{dirtyCount}</span></div>}
      </div>
      <div style={st.controlStrip}>
        <input style={st.searchInput} placeholder="Search items..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
        <button style={showMissingOnly?st.btnToggleActive:st.btnToggle} onClick={()=>setShowMissingOnly(!showMissingOnly)}>Missing Price</button>
        <div style={{flex:1}}/>
        <button style={st.btnSmOutline} onClick={()=>bulkAdj(0.9)}>-10%</button>
        <button style={st.btnSmOutline} onClick={()=>bulkAdj(1.1)}>+10%</button>
        <button style={st.btnSmOutline} onClick={visToIdeal}>Visible = Ideal</button>
        <button style={{...st.btnPrimarySm,opacity:dirtyCount>0?1:0.5}} disabled={dirtyCount===0}>Save Changes ({dirtyCount})</button>
      </div>
      <div style={st.card}><div style={st.tableWrap}><table style={st.table}><thead><tr>
        <th style={{...st.th,width:30}}>#</th><th style={st.th}>Description / Title</th><th style={st.th}>Brand</th><th style={{...st.th,width:55,textAlign:"center"}}>Qty</th><th style={st.th}>Category</th><th style={st.th}>Condition</th><th style={{...st.th,textAlign:"right"}}>Retail</th><th style={{...st.th,textAlign:"right"}}>Ideal</th><th style={{...st.th,textAlign:"right",minWidth:120}}>Price</th><th style={{...st.th,textAlign:"center",width:72}}>vs Ideal</th>
      </tr></thead><tbody>{filtered.map((r,i)=>{
        const vs=r.proposed_price>0?(((r.final_price||0)/r.proposed_price)*100).toFixed(0):"--";
        const vc=vs>=95&&vs<=105?"#2D6A4F":vs<95?"#c0392b":"#B8860B";
        return(<tr key={r.id} style={{...(i%2===0?st.trEven:{}),...(r.dirty?{backgroundColor:"#FFFDF0"}:{})}}>
          <td style={{...st.td,color:"#999",fontSize:12}}>{r.id}</td>
          <td style={st.td}><div style={{fontWeight:600,color:"#1B4332",fontSize:13}}>{r.title}</div><div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}><span style={{fontSize:12,color:"#2D6A4F"}}>{r.ai_title}</span><button style={st.applyBtn}>Apply</button></div></td>
          <td style={{...st.td,fontSize:13}}>{r.ai_brand}</td>
          <td style={{...st.td,textAlign:"center"}}>{r.qty}</td>
          <td style={st.td}><span style={st.catTag}>{r.ai_category}</span></td>
          <td style={st.td}><select style={st.condSelect} defaultValue={r.condition}><option>Used - Good</option><option>Used - Fair</option><option>Used - Poor</option><option>New</option><option>Refurbished</option></select></td>
          <td style={{...st.td,textAlign:"right",color:"#888"}}>${r.retail.toFixed(2)}</td>
          <td style={{...st.td,textAlign:"right",color:"#2D6A4F",fontSize:12}}>${r.proposed_price?.toFixed(2)}</td>
          <td style={{...st.td,textAlign:"right"}}><div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
            <button style={st.microBtn} onClick={()=>updateRow(r.id,"final_price",Math.round((r.final_price*0.9)*100)/100)}>-</button>
            {editingCell===`${r.id}-p`?<input type="number" step="0.01" style={{...st.inlineInput,width:70,textAlign:"right"}} defaultValue={r.final_price} autoFocus onBlur={e=>{updateRow(r.id,"final_price",parseFloat(e.target.value)||0);setEditingCell(null);}} onKeyDown={e=>e.key==="Enter"&&e.target.blur()}/>:<span style={{fontWeight:700,color:"#1B4332",cursor:"pointer",minWidth:50,textAlign:"right"}} onClick={()=>setEditingCell(`${r.id}-p`)}>${(r.final_price||0).toFixed(2)}</span>}
            <button style={st.microBtn} onClick={()=>updateRow(r.id,"final_price",Math.round((r.final_price*1.1)*100)/100)}>+</button>
          </div></td>
          <td style={{...st.td,textAlign:"center"}}><span style={{...st.vsChip,backgroundColor:vc+"18",color:vc}}>{vs}%</span></td>
        </tr>);
      })}</tbody></table></div></div>
      <div style={st.finalizeBar}>
        {dirtyCount>0&&<div style={st.warnText}>⚠ {dirtyCount} unsaved row(s). Save before finalizing.</div>}
        <div style={{flex:1}}/>
        <button style={{...st.btnPrimary,opacity:missingCount===0&&dirtyCount===0?1:0.5}} onClick={()=>setShowFinalizeConfirm(true)} disabled={missingCount>0||dirtyCount>0}>Finalize and Open Processing →</button>
      </div>
      {showFinalizeConfirm&&<ConfirmModal title="Finalize Preprocessing" message="This will lock the manifest and move all staged rows into Processing." confirmLabel="Finalize and Open Processing" onConfirm={()=>{setShowFinalizeConfirm(false);alert("→ /inventory/processing?order="+MOCK_ORDER.id);}} onCancel={()=>setShowFinalizeConfirm(false)}/>}
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────
export default function PreprocessingPage(){
  const [activeStep,setActiveStep] = useState(0);
  const [completedStep,setCompletedStep] = useState(-1);
  const [uploaded,setUploaded] = useState(false);
  return (
    <div style={st.layout}>
      <Sidebar activeItem="Preprocessing"/>
      <div style={st.main}>
        <div style={st.header}>
          <div style={st.headerLeft}><button style={st.backBtn}>← Back to Order</button><h1 style={st.pageTitle}>Preprocessing</h1><span style={st.orderSub}>Order #{MOCK_ORDER.id} - {MOCK_ORDER.vendor}</span></div>
          <div style={st.headerRight}><span style={st.headerMeta}>{MOCK_ORDER.units} units</span><span style={st.headerMeta}>Est. {MOCK_ORDER.retailEst}</span><div style={st.avatar}>BR</div></div>
        </div>
        <Stepper current={activeStep} onStep={n=>{if(n<=completedStep+1)setActiveStep(n);}} completedStep={completedStep}/>
        <div style={st.content}>
          {activeStep===0&&<Step1Standardize onStandardize={()=>{setCompletedStep(Math.max(completedStep,0));setActiveStep(1);}} isDone={completedStep>=0} onUndo={()=>{setCompletedStep(-1);setUploaded(false);setActiveStep(0);}}/>}
          {activeStep===1&&<Step2Cleanup orderNumber={MOCK_ORDER.id} onUpload={()=>{setUploaded(true);setCompletedStep(Math.max(completedStep,1));}} isUploaded={uploaded} standardizedCount={RAW_SAMPLE_ROWS.length}/>}
          {activeStep===2&&<Step3Review completedStep={completedStep}/>}
        </div>
      </div>
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
  navSection:{padding:"10px 16px",fontSize:14,display:"flex",alignItems:"center",gap:10,cursor:"pointer",color:"#B8D4C8",fontWeight:600},
  navSecActive:{backgroundColor:"rgba(255,255,255,0.08)",color:"#fff"},
  navIco:{fontSize:16,width:20,textAlign:"center"},chev:{marginLeft:"auto",fontSize:11,opacity:0.6},chevSm:{marginLeft:"auto",fontSize:10,opacity:0.5},
  navGroup:{padding:"8px 16px 4px 20px",fontSize:10,fontWeight:700,letterSpacing:"0.8px",color:"#6B9E86",textTransform:"uppercase",cursor:"pointer",display:"flex",alignItems:"center"},
  navChild:{padding:"7px 16px 7px 46px",fontSize:13,cursor:"pointer",color:"#A4CBBA",position:"relative"},
  navChildActive:{color:"#fff",backgroundColor:"rgba(255,255,255,0.1)",fontWeight:600},
  activeBar:{position:"absolute",left:0,top:0,bottom:0,width:3,backgroundColor:"#52B788",borderRadius:"0 2px 2px 0"},
  version:{position:"absolute",bottom:16,left:16,fontSize:11,color:"#5A8A72"},
  main:{flex:1,display:"flex",flexDirection:"column",minWidth:0},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 24px",backgroundColor:"#fff",borderBottom:"1px solid #DDD5C9"},
  headerLeft:{display:"flex",alignItems:"center",gap:12},headerRight:{display:"flex",alignItems:"center",gap:16},
  backBtn:{background:"none",border:"none",fontSize:13,cursor:"pointer",color:"#2D6A4F",fontWeight:600,padding:"4px 0"},
  pageTitle:{fontSize:18,fontWeight:700,color:"#1B4332",margin:0},orderSub:{fontSize:13,color:"#777"},
  headerMeta:{fontSize:13,color:"#888"},avatar:{width:32,height:32,borderRadius:"50%",backgroundColor:"#2D6A4F",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700},
  stepperWrap:{display:"flex",gap:10,padding:"14px 24px",backgroundColor:"#fff",borderBottom:"2px solid #DDD5C9"},
  chip:{padding:"8px 18px",borderRadius:20,fontSize:13,cursor:"pointer",transition:"all 0.2s",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"},
  content:{padding:24,flex:1,overflowY:"auto"},
  alertSuccess:{padding:"12px 16px",backgroundColor:"#E8F5EE",border:"1px solid #A3D9BB",borderRadius:8,color:"#1B4332",fontSize:14,marginBottom:16},
  actionBar:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",backgroundColor:"#fff",borderRadius:8,border:"1px solid #DDD5C9",marginBottom:16},
  actionBarLeft:{display:"flex",gap:8,alignItems:"center"},actionBarRight:{display:"flex",gap:8,alignItems:"center"},
  partialHint:{fontSize:12,color:"#B8860B",fontStyle:"italic",maxWidth:280},
  card:{backgroundColor:"#fff",borderRadius:8,border:"1px solid #DDD5C9",padding:20,marginBottom:16},
  cardHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12},
  cardTitle:{margin:0,fontSize:16,fontWeight:700,color:"#1B4332"},cardDesc:{fontSize:13,color:"#666",margin:"0 0 16px",lineHeight:1.5},
  badge:{fontSize:12,padding:"3px 10px",borderRadius:12,backgroundColor:"#EDE8E0",color:"#666",fontWeight:600},
  badgeMuted:{fontSize:11,padding:"2px 8px",borderRadius:10,backgroundColor:"#f0ece4",color:"#999",fontWeight:500},

  // Template selector
  templateRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",backgroundColor:"#FAFAF6",borderRadius:6,border:"1px solid #EDE8E0",marginBottom:16},
  templateSelectorWrap:{display:"flex",alignItems:"center",gap:10},
  templateDropdownBtn:{display:"flex",alignItems:"center",gap:4,padding:"6px 14px",backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:6,cursor:"pointer",textAlign:"left",minWidth:240},
  templateDropdown:{position:"absolute",top:"100%",left:0,right:0,minWidth:300,backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:20,overflow:"hidden"},
  templateDropdownHeader:{padding:"8px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px",color:"#888",backgroundColor:"#FAFAF6",borderBottom:"1px solid #EDE8E0"},
  templateDropdownItem:{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f0ece4",transition:"background 0.1s"},
  templateDropdownItemActive:{backgroundColor:"#F0F7F4",borderLeft:"3px solid #2D6A4F"},
  templateNameInput:{padding:"5px 10px",border:"1px solid #DDD5C9",borderRadius:4,fontSize:13,width:200,outline:"none",fontFamily:"inherit"},

  // Tables
  tableWrap:{overflowX:"auto"},table:{width:"100%",borderCollapse:"collapse",fontSize:13},
  th:{textAlign:"left",padding:"10px 12px",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:"0.5px",color:"#1B4332",borderBottom:"2px solid #DDD5C9",backgroundColor:"#FAFAF6",whiteSpace:"nowrap"},
  thSm:{textAlign:"left",padding:"6px 10px",fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:"0.4px",color:"#1B4332",borderBottom:"2px solid #DDD5C9",backgroundColor:"#FAFAF6",whiteSpace:"nowrap"},
  td:{padding:"10px 12px",borderBottom:"1px solid #EDE8E0",fontSize:13,color:"#333"},
  tdSm:{padding:"5px 10px",borderBottom:"1px solid #EDE8E0",fontSize:12,color:"#444"},
  trEven:{backgroundColor:"#FAFAF6"},
  formulaInput:{width:"100%",padding:"7px 10px",border:"1px solid #DDD5C9",borderRadius:4,fontSize:13,fontFamily:"'Fira Code','SF Mono','Consolas',monospace",color:"#1B4332",outline:"none",boxSizing:"border-box",backgroundColor:"#fff"},
  aiChip:{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:3,backgroundColor:"#E3F2FD",color:"#1565C0",cursor:"help",letterSpacing:"0.3px"},
  suggestBox:{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:4,boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:10,maxHeight:200,overflowY:"auto"},
  suggestItem:{padding:"6px 10px",cursor:"pointer",fontSize:12,borderBottom:"1px solid #f0ece4"},
  sampleResult:{fontSize:12,color:"#2D6A4F",fontWeight:500,padding:"4px 8px",backgroundColor:"#F0F7F4",borderRadius:4,fontFamily:"'DM Sans',system-ui",wordBreak:"break-word"},
  sampleEmpty:{fontSize:12,color:"#ccc",fontStyle:"italic"},
  codeSm:{backgroundColor:"#EDE8E0",padding:"1px 5px",borderRadius:3,fontSize:11,fontFamily:"monospace",color:"#1B4332"},

  // Buttons
  btnPrimary:{padding:"10px 20px",backgroundColor:"#2D6A4F",color:"#fff",border:"none",borderRadius:6,fontSize:14,fontWeight:600,cursor:"pointer"},
  btnPrimarySm:{padding:"6px 14px",backgroundColor:"#2D6A4F",color:"#fff",border:"none",borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer"},
  btnOutline:{padding:"10px 20px",backgroundColor:"#fff",color:"#555",border:"1px solid #ccc",borderRadius:6,fontSize:14,fontWeight:500,cursor:"pointer"},
  btnOutlineSm:{padding:"6px 14px",backgroundColor:"#fff",color:"#2D6A4F",border:"1px solid #2D6A4F",borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6},
  btnOutlineWarn:{padding:"6px 14px",backgroundColor:"#fff",color:"#c0392b",border:"1px solid #c0392b",borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4},
  btnDanger:{padding:"10px 20px",backgroundColor:"#c0392b",color:"#fff",border:"none",borderRadius:6,fontSize:14,fontWeight:600,cursor:"pointer"},
  btnTextDanger:{background:"none",border:"none",color:"#c0392b",fontSize:12,fontWeight:600,cursor:"pointer",padding:"6px 8px"},
  btnSmOutline:{padding:"5px 10px",backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:4,fontSize:11,fontWeight:600,cursor:"pointer",color:"#555"},
  microBtn:{width:22,height:22,borderRadius:3,border:"1px solid #DDD5C9",backgroundColor:"#FAFAF6",cursor:"pointer",fontSize:12,fontWeight:700,color:"#555",display:"flex",alignItems:"center",justifyContent:"center",padding:0},
  applyBtn:{fontSize:10,padding:"1px 6px",borderRadius:3,border:"1px solid #2D6A4F",backgroundColor:"#E8F5EE",color:"#2D6A4F",fontWeight:600,cursor:"pointer"},
  spinner:{display:"inline-block",width:12,height:12,border:"2px solid #ccc",borderTop:"2px solid #2D6A4F",borderRadius:"50%",animation:"spin 0.6s linear infinite"},
  btnToggle:{padding:"5px 12px",border:"1px solid #DDD5C9",borderRadius:4,fontSize:12,fontWeight:500,cursor:"pointer",backgroundColor:"#fff",color:"#555"},
  btnToggleActive:{padding:"5px 12px",border:"1px solid #2D6A4F",borderRadius:4,fontSize:12,fontWeight:600,cursor:"pointer",backgroundColor:"#E8F5EE",color:"#2D6A4F"},

  // Step 2
  cleanGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20},
  cleanCard:{border:"1px solid #DDD5C9",borderRadius:8,padding:24,display:"flex",flexDirection:"column",alignItems:"center",gap:10,textAlign:"center"},
  cleanIcon:{width:48,height:48,borderRadius:"50%",backgroundColor:"#F0F7F4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:"#2D6A4F",fontWeight:700},
  cleanTitle:{margin:0,fontSize:15,fontWeight:700,color:"#1B4332"},
  fileName:{fontFamily:"monospace",fontSize:13,color:"#2D6A4F",backgroundColor:"#F0F7F4",padding:"4px 12px",borderRadius:4,fontWeight:600},
  chipRow:{display:"flex",gap:6},chipInfo:{fontSize:11,padding:"2px 8px",borderRadius:10,backgroundColor:"#E3F2FD",color:"#1565C0",fontWeight:500},
  chipSuccess:{fontSize:11,padding:"2px 8px",borderRadius:10,backgroundColor:"#E8F5EE",color:"#2D6A4F",fontWeight:500},
  chipWarn:{fontSize:11,padding:"2px 8px",borderRadius:10,backgroundColor:"#FFF3E0",color:"#B8860B",fontWeight:500},
  dropZone:{border:"2px dashed #B8D4C8",borderRadius:8,padding:"18px 24px",cursor:"pointer",fontSize:13,color:"#666",width:"100%",boxSizing:"border-box"},
  dropZoneActive:{borderColor:"#2D6A4F",backgroundColor:"#F0F7F4"},
  uploadedBadge:{fontSize:14,fontWeight:600,color:"#2D6A4F",padding:"8px 16px",backgroundColor:"#D4EDDA",borderRadius:6},
  logBox:{marginTop:16,padding:12,backgroundColor:"#f9f9f7",borderRadius:6,border:"1px solid #EDE8E0",fontFamily:"monospace",fontSize:11},
  logLine:{padding:"2px 0"},logTs:{color:"#aaa",marginRight:8},

  // Step 3
  summaryRow:{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"},
  summaryChip:{padding:"8px 14px",backgroundColor:"#fff",border:"1px solid #DDD5C9",borderRadius:8,display:"flex",flexDirection:"column",gap:2,minWidth:80},
  summaryLabel:{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.4px",color:"#888"},
  summaryVal:{fontSize:18,fontWeight:700,color:"#1B4332"},
  controlStrip:{display:"flex",gap:8,alignItems:"center",padding:"10px 16px",backgroundColor:"#fff",borderRadius:8,border:"1px solid #DDD5C9",marginBottom:16},
  searchInput:{padding:"6px 12px",border:"1px solid #DDD5C9",borderRadius:4,fontSize:13,width:200,outline:"none"},
  catTag:{fontSize:11,padding:"2px 8px",borderRadius:3,backgroundColor:"#EDE8E0",color:"#555",fontWeight:500,whiteSpace:"nowrap"},
  condSelect:{padding:"3px 6px",borderRadius:3,border:"1px solid #DDD5C9",fontSize:11,backgroundColor:"#fff"},
  vsChip:{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10},
  inlineInput:{width:"100%",padding:"4px 8px",border:"2px solid #2D6A4F",borderRadius:4,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  finalizeBar:{display:"flex",alignItems:"center",padding:"14px 16px",backgroundColor:"#fff",borderRadius:8,border:"1px solid #DDD5C9"},
  warnText:{fontSize:13,color:"#B8860B",fontWeight:500},

  // Modal
  overlay:{position:"fixed",top:0,left:0,right:0,bottom:0,backgroundColor:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000},
  modal:{backgroundColor:"#fff",borderRadius:12,padding:32,maxWidth:440,width:"90%",textAlign:"center"},
  modalTitle:{fontSize:18,fontWeight:700,color:"#1B4332",margin:"0 0 8px"},
  modalText:{fontSize:14,color:"#555",lineHeight:1.5,margin:"0 0 20px"},
  modalActions:{display:"flex",gap:12,justifyContent:"center"},
};
