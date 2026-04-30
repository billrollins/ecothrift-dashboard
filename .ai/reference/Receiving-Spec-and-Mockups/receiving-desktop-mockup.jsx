import { useState, useCallback, useRef } from "react";

/* ── Icons ───────────────────────────────────────────── */
const Svg = ({ children, size = 20, ...p }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>;
const IconUpload = (p) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></Svg>;
const IconCheck = (p) => <Svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></Svg>;
const IconFlag = (p) => <Svg {...p}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></Svg>;
const IconImage = (p) => <Svg {...p}><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></Svg>;
const IconX = (p) => <Svg size={16} {...p}><path d="M18 6 6 18M6 6l12 12"/></Svg>;
const IconMic = (p) => <Svg {...p}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></Svg>;
const IconTruck = (p) => <Svg {...p}><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></Svg>;
const IconZap = (p) => <Svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>;
const IconChevron = (p) => <Svg size={16} {...p}><path d="m6 9 6 6 6-6"/></Svg>;

const ORDERS = [
  { id: "AMZ0N-OQL-CCP4", vendor: "Amazon", code: "AMZ", desc: "24 Pallets - FBA Home Improvement" },
  { id: "WAL140608", vendor: "Walmart", code: "WAL", desc: "6 Pallets - General Merchandise" },
  { id: "TRGET-O9J-Q5JN", vendor: "Target", code: "TRGET", desc: "18 Pallets - Mixed Categories" },
];
const SIDES = ["Front", "Right", "Back", "Left"];
const CONDITIONS = ["Good", "Mixed", "Damaged"];
const COND_COLORS = { Good: { border: "#059669", bg: "rgba(5,150,105,0.06)", text: "#059669" }, Mixed: { border: "#d97706", bg: "rgba(217,119,6,0.06)", text: "#d97706" }, Damaged: { border: "#dc2626", bg: "rgba(220,38,38,0.06)", text: "#dc2626" } };

const nowTime = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
const todayStr = () => new Date().toISOString().split("T")[0];

const genColor = (seed) => {
  const hues = [210, 190, 250, 340, 30, 160, 280, 50];
  return `hsl(${hues[seed % hues.length]}, 50%, 82%)`;
};

/* ── Photo thumbnail (simulated) ─────────────────────── */
function PhotoThumb({ file, onRemove, small }) {
  return (
    <div style={{
      width: "100%", height: "100%",
      borderRadius: small ? 6 : 8,
      background: `linear-gradient(135deg, ${genColor(file.seed)} 0%, ${genColor(file.seed + 3)} 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      position: "relative", overflow: "hidden",
    }}>
      <IconImage size={small ? 14 : 18} stroke="rgba(0,0,0,0.25)" />
      <span style={{
        position: "absolute", bottom: 2, left: 4,
        fontSize: 9, color: "rgba(0,0,0,0.4)", fontWeight: 600,
        maxWidth: "90%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{file.name}</span>
      {onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{
          position: "absolute", top: 2, right: 2,
          width: 18, height: 18, borderRadius: 4,
          background: "rgba(0,0,0,0.5)", border: "none",
          color: "white", cursor: "pointer", display: "flex",
          alignItems: "center", justifyContent: "center", padding: 0,
        }}>
          <IconX size={10} />
        </button>
      )}
    </div>
  );
}

/* ── Drop zone (reusable) ────────────────────────────── */
function DropZone({ onDrop, children, label, sublabel, hasContent, style: sx, small }) {
  const [over, setOver] = useState(false);
  const handleDrop = useCallback(e => {
    e.preventDefault(); setOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length) onDrop(files);
  }, [onDrop]);

  if (hasContent) return <div style={{ width: "100%", height: "100%", ...sx }}>{children}</div>;

  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${over ? "#3b82f6" : "#dde2e9"}`,
        borderRadius: small ? 6 : 10,
        background: over ? "rgba(59,130,246,0.04)" : "#fafbfc",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: small ? 2 : 6,
        cursor: "pointer",
        transition: "all 150ms ease",
        width: "100%", height: "100%",
        ...sx,
      }}
      onClick={() => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = "image/*"; input.multiple = true;
        input.onchange = e => { const f = Array.from(e.target.files); if (f.length) onDrop(f); };
        input.click();
      }}
    >
      {!small && <IconUpload size={18} stroke="#94a3b8" />}
      {label && <span style={{ fontSize: small ? 10 : 12, color: "#94a3b8", fontWeight: 500, textAlign: "center" }}>{label}</span>}
      {sublabel && <span style={{ fontSize: 10, color: "#cbd5e1" }}>{sublabel}</span>}
    </div>
  );
}

/* ── Pallet Card ─────────────────────────────────────── */
function PalletCard({ index, pallet, onPhotoAdd, onPhotoRemove, onToggleDamage }) {
  const done = pallet.photos.every(Boolean);
  const photoCount = pallet.photos.filter(Boolean).length;

  return (
    <div style={{
      background: "white", borderRadius: 12,
      border: `1.5px solid ${pallet.damaged ? "#fecaca" : done ? "#a7f3d0" : "#eef0f4"}`,
      overflow: "hidden",
      transition: "border-color 200ms ease",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid #f5f6f8",
        background: pallet.damaged ? "#fef2f2" : done ? "#f0fdf4" : "white",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 15, fontWeight: 700,
            fontFamily: "'DM Mono', monospace",
            color: done ? "#059669" : "#1e293b",
          }}>
            #{index + 1}
          </span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{photoCount}/4</span>
          {done && <IconCheck size={14} stroke="#059669" />}
        </div>
        <button onClick={onToggleDamage} style={{
          background: pallet.damaged ? "#dc2626" : "transparent",
          border: `1px solid ${pallet.damaged ? "#dc2626" : "#e2e8f0"}`,
          borderRadius: 5, padding: "3px 8px",
          display: "flex", alignItems: "center", gap: 4,
          color: pallet.damaged ? "white" : "#cbd5e1",
          fontSize: 10, fontWeight: 600, cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 150ms ease",
        }}>
          <IconFlag size={10} />
          {pallet.damaged ? "DMG" : "Flag"}
        </button>
      </div>

      {/* 2x2 photo grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr",
        gap: 4, padding: 6,
      }}>
        {SIDES.map((side, si) => (
          <div key={side} style={{ aspectRatio: "4/3" }}>
            {pallet.photos[si] ? (
              <PhotoThumb file={pallet.photos[si]} onRemove={() => onPhotoRemove(si)} small />
            ) : (
              <DropZone
                small
                label={side}
                onDrop={files => onPhotoAdd(si, files[0])}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════ */
export default function DesktopReceiving() {
  const [order, setOrder] = useState(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [receivedDate, setReceivedDate] = useState(todayStr());
  const [startTime, setStartTime] = useState(nowTime());
  const [endTime, setEndTime] = useState("");
  const [bolPhoto, setBolPhoto] = useState(null);
  const [truckPhoto, setTruckPhoto] = useState(null);
  const [palletCount, setPalletCount] = useState("");
  const [pallets, setPallets] = useState([]);
  const [condition, setCondition] = useState(null);
  const [issues, setIssues] = useState("");
  const [bulkDragOver, setBulkDragOver] = useState(false);
  const fileCounter = useRef(0);

  const makeFile = (f) => ({ name: f?.name || `photo_${fileCounter.current}`, seed: fileCounter.current++ });

  const setupPallets = (n) => {
    const count = parseInt(n);
    if (count > 0 && count <= 99) {
      setPallets(Array.from({ length: count }, () => ({ photos: [null, null, null, null], damaged: false })));
    }
  };

  const addPhotoToPallet = (pi, si, file) => {
    setPallets(prev => {
      const next = [...prev];
      next[pi] = { ...next[pi], photos: [...next[pi].photos] };
      next[pi].photos[si] = makeFile(file);
      return next;
    });
  };

  const removePhotoFromPallet = (pi, si) => {
    setPallets(prev => {
      const next = [...prev];
      next[pi] = { ...next[pi], photos: [...next[pi].photos] };
      next[pi].photos[si] = null;
      return next;
    });
  };

  const toggleDamage = (pi) => {
    setPallets(prev => {
      const next = [...prev];
      next[pi] = { ...next[pi], damaged: !next[pi].damaged };
      return next;
    });
  };

  // Bulk drop: fill empty slots sequentially
  const handleBulkDrop = useCallback((e) => {
    e.preventDefault();
    setBulkDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (!files.length || !pallets.length) return;

    setPallets(prev => {
      const next = prev.map(p => ({ ...p, photos: [...p.photos] }));
      let fi = 0;
      for (let pi = 0; pi < next.length && fi < files.length; pi++) {
        for (let si = 0; si < 4 && fi < files.length; si++) {
          if (!next[pi].photos[si]) {
            next[pi].photos[si] = makeFile(files[fi]);
            fi++;
          }
        }
      }
      return next;
    });
  }, [pallets.length]);

  const completedPallets = pallets.filter(p => p.photos.every(Boolean)).length;
  const totalPhotos = pallets.reduce((s, p) => s + p.photos.filter(Boolean).length, 0) + (bolPhoto ? 1 : 0) + (truckPhoto ? 1 : 0);
  const damagedCount = pallets.filter(p => p.damaged).length;
  const allPalletsDone = pallets.length > 0 && completedPallets === pallets.length;

  return (
    <div style={{
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: "#eef1f5", minHeight: "100vh", color: "#1e293b",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* ── TOP BAR ──────────────────────────────────── */}
      <div style={{
        background: "white", borderBottom: "1px solid #dde2e9",
        padding: "0 28px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IconTruck size={18} stroke="#64748b" />
            <span style={{ fontSize: 15, fontWeight: 700 }}>Receiving</span>
          </div>
          <div style={{ width: 1, height: 24, background: "#e2e8f0" }} />
          {/* Order selector */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setOrderOpen(!orderOpen)} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 12px", borderRadius: 8,
              border: "1px solid #e2e8f0", background: "white",
              cursor: "pointer", fontFamily: "inherit", fontSize: 13,
              color: order ? "#1e293b" : "#94a3b8", fontWeight: 500,
            }}>
              {order ? (
                <>
                  <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{order.id}</span>
                  <span style={{ color: "#94a3b8" }}>{order.vendor}</span>
                </>
              ) : "Select order..."}
              <IconChevron />
            </button>
            {orderOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0,
                background: "white", borderRadius: 10, border: "1px solid #e2e8f0",
                boxShadow: "0 12px 40px rgba(0,0,0,0.1)", zIndex: 50,
                width: 340, overflow: "hidden",
              }}>
                {ORDERS.map(o => (
                  <button key={o.id} onClick={() => { setOrder(o); setOrderOpen(false); setStartTime(nowTime()); }}
                    style={{
                      width: "100%", padding: "12px 14px", border: "none",
                      background: order?.id === o.id ? "#f1f5f9" : "white",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      display: "flex", alignItems: "center", gap: 10,
                      borderBottom: "1px solid #f5f6f8",
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 7, background: "#f1f5f9",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: "#475569", flexShrink: 0,
                    }}>{o.code.slice(0, 2)}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{o.id}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>{o.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right side stats */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {pallets.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>
                <strong style={{ color: "#1e293b" }}>{completedPallets}</strong>/{pallets.length} pallets
              </span>
              <span style={{ color: "#64748b" }}>
                <strong style={{ color: "#1e293b" }}>{totalPhotos}</strong> photos
              </span>
              {damagedCount > 0 && (
                <span style={{ color: "#ef4444", fontWeight: 600 }}>{damagedCount} damaged</span>
              )}
            </div>
          )}
          <button onClick={() => { setEndTime(nowTime()); }} disabled={!order || !condition || !allPalletsDone} style={{
            padding: "8px 20px", borderRadius: 8, border: "none",
            background: (order && condition && allPalletsDone) ? "#059669" : "#e2e8f0",
            color: (order && condition && allPalletsDone) ? "white" : "#94a3b8",
            fontSize: 13, fontWeight: 700, cursor: (order && condition && allPalletsDone) ? "pointer" : "default",
            fontFamily: "inherit", transition: "all 200ms ease",
          }}>
            Complete Receiving
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────── */}
      <div style={{ display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" }}>

        {/* ── LEFT PANEL ─────────────────────────────── */}
        <div style={{
          width: 320, flexShrink: 0,
          borderRight: "1px solid #dde2e9",
          background: "white",
          overflowY: "auto",
          padding: "20px",
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          {/* Dates & times */}
          <div>
            <div style={S.panelLabel}>Date & Time</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={S.fieldLabel}>Received Date</label>
                <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={S.input} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={S.fieldLabel}>Start</label>
                  <input value={startTime} onChange={e => setStartTime(e.target.value)} placeholder="Auto" style={S.input} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={S.fieldLabel}>End</label>
                  <input value={endTime} onChange={e => setEndTime(e.target.value)} placeholder="On complete" style={S.input} />
                </div>
              </div>
            </div>
          </div>

          {/* BOL */}
          <div>
            <div style={S.panelLabel}>Bill of Lading</div>
            <div style={{ height: 100 }}>
              {bolPhoto ? (
                <PhotoThumb file={bolPhoto} onRemove={() => setBolPhoto(null)} />
              ) : (
                <DropZone label="Drop BOL photo" onDrop={f => setBolPhoto(makeFile(f[0]))} />
              )}
            </div>
          </div>

          {/* Truck */}
          <div>
            <div style={S.panelLabel}>Truck Photo</div>
            <div style={{ height: 100 }}>
              {truckPhoto ? (
                <PhotoThumb file={truckPhoto} onRemove={() => setTruckPhoto(null)} />
              ) : (
                <DropZone label="Drop truck photo" onDrop={f => setTruckPhoto(makeFile(f[0]))} />
              )}
            </div>
          </div>

          {/* Pallet count */}
          <div>
            <div style={S.panelLabel}>Pallet Count</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number" inputMode="numeric" min={1} max={99}
                value={palletCount}
                onChange={e => setPalletCount(e.target.value)}
                placeholder="0"
                style={{ ...S.input, flex: 1, fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700 }}
              />
              <button onClick={() => setupPallets(palletCount)} disabled={!palletCount || parseInt(palletCount) < 1}
                style={{
                  padding: "0 16px", borderRadius: 8, border: "none",
                  background: palletCount && parseInt(palletCount) > 0 ? "#0f172a" : "#e2e8f0",
                  color: palletCount && parseInt(palletCount) > 0 ? "white" : "#94a3b8",
                  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>
                Set
              </button>
            </div>
          </div>

          {/* Condition */}
          <div>
            <div style={S.panelLabel}>Condition</div>
            <div style={{ display: "flex", gap: 6 }}>
              {CONDITIONS.map(c => {
                const cc = COND_COLORS[c];
                const active = condition === c;
                return (
                  <button key={c} onClick={() => setCondition(c)} style={{
                    flex: 1, padding: "12px 6px", borderRadius: 10,
                    border: `2px solid ${active ? cc.border : "#eef0f4"}`,
                    background: active ? cc.bg : "white",
                    color: active ? cc.text : "#94a3b8",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit", transition: "all 150ms ease",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 18, marginBottom: 4 }}>
                      {c === "Good" ? "👍" : c === "Mixed" ? "⚠️" : "🚨"}
                    </div>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Issues */}
          <div>
            <div style={{ ...S.panelLabel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              Issues / Notes
            </div>
            <textarea
              value={issues} onChange={e => setIssues(e.target.value)}
              placeholder="Damage details, missing items..."
              rows={4}
              style={{
                ...S.input, height: "auto", resize: "none",
                fontSize: 13, lineHeight: 1.5,
              }}
            />
          </div>
        </div>

        {/* ── RIGHT: PALLET AREA ─────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {pallets.length === 0 ? (
            /* Empty state */
            <div style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
              flexDirection: "column", gap: 12, color: "#94a3b8",
            }}>
              <IconTruck size={48} stroke="#dde2e9" />
              <div style={{ fontSize: 16, fontWeight: 600, color: "#475569" }}>No pallets set up</div>
              <div style={{ fontSize: 13 }}>Select an order and set the pallet count to begin</div>
            </div>
          ) : (
            <>
              {/* Bulk drop banner */}
              <div
                onDragOver={e => { e.preventDefault(); setBulkDragOver(true); }}
                onDragLeave={() => setBulkDragOver(false)}
                onDrop={handleBulkDrop}
                style={{
                  margin: "16px 20px 4px",
                  padding: bulkDragOver ? "24px 20px" : "12px 20px",
                  borderRadius: 12,
                  border: `2px dashed ${bulkDragOver ? "#3b82f6" : "#dde2e9"}`,
                  background: bulkDragOver ? "rgba(59,130,246,0.04)" : "white",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  transition: "all 200ms ease",
                  cursor: "pointer",
                }}
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file"; input.accept = "image/*"; input.multiple = true;
                  input.onchange = e => {
                    const fakeEvent = { preventDefault: ()=>{}, dataTransfer: { files: e.target.files } };
                    handleBulkDrop(fakeEvent);
                  };
                  input.click();
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: bulkDragOver ? "rgba(59,130,246,0.1)" : "#f1f5f9",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <IconZap size={16} stroke={bulkDragOver ? "#3b82f6" : "#94a3b8"} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: bulkDragOver ? "#3b82f6" : "#1e293b" }}>
                    Quick Fill: Drop all pallet photos here
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    Photos auto-assign sequentially: Pallet 1 (F, R, B, L), Pallet 2 (F, R, B, L), ...
                  </div>
                </div>
              </div>

              {/* Pallet grid */}
              <div style={{
                flex: 1, padding: "12px 20px 20px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                gap: 12,
                alignContent: "start",
              }}>
                {pallets.map((p, i) => (
                  <PalletCard
                    key={i}
                    index={i}
                    pallet={p}
                    onPhotoAdd={(si, file) => addPhotoToPallet(i, si, file)}
                    onPhotoRemove={(si) => removePhotoFromPallet(i, si)}
                    onToggleDamage={() => toggleDamage(i)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S = {
  panelLabel: {
    fontSize: 11, fontWeight: 700, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: "0.05em",
    marginBottom: 10,
  },
  fieldLabel: {
    display: "block", fontSize: 11, fontWeight: 600,
    color: "#64748b", marginBottom: 4,
  },
  input: {
    width: "100%", padding: "8px 10px", height: 38,
    fontSize: 13, fontFamily: "inherit",
    border: "1px solid #e2e8f0", borderRadius: 8,
    outline: "none", color: "#1e293b", background: "white",
    transition: "border-color 150ms ease",
  },
};
