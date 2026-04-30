import { useState, useEffect, useRef } from "react";

/* ── Icons ───────────────────────────────────────────── */
const Icon = ({ d, size = 24, stroke = "currentColor", fill = "none", sw = 2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const ArrowLeft = ({ s = 22 }) => <Icon size={s} d={<path d="M19 12H5M12 19l-7-7 7-7"/>} />;
const Camera = ({ s = 28 }) => <Icon size={s} d={<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></>} />;
const Check = ({ s = 20 }) => <Icon size={s} d={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></>} sw={2.5} />;
const Upload = ({ s = 20 }) => <Icon size={s} d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></>} />;
const Flag = ({ s = 20 }) => <Icon size={s} d={<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>} />;
const Mic = ({ s = 22 }) => <Icon size={s} d={<><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></>} />;
const Truck = ({ s = 24 }) => <Icon size={s} d={<><path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>} />;
const Package = ({ s = 24 }) => <Icon size={s} d={<><path d="m16.5 9.4-9-5.19"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05"/><path d="M12 22.08V12"/></>} />;
const Clock = ({ s = 16 }) => <Icon size={s} d={<><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>} />;
const Image = ({ s = 20 }) => <Icon size={s} d={<><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></>} />;

const ORDERS = [
  { id: "AMZ0N-OQL-CCP4", vendor: "Amazon", code: "AMZ", items: 936, desc: "24 Pallets - FBA Home Improvement" },
  { id: "WAL140608", vendor: "Walmart", code: "WAL", items: 142, desc: "6 Pallets - General Merchandise" },
  { id: "TRGET-O9J-Q5JN", vendor: "Target", code: "TRGET", items: 2348, desc: "18 Pallets - Mixed Categories" },
];

const SIDES = ["Front", "Right", "Back", "Left"];

const now = () => {
  const d = new Date();
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
};
const today = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/* ── Simulated shutter ───────────────────────────────── */
function CameraShutter({ onCapture, label, sublabel }) {
  const [flash, setFlash] = useState(false);
  const capture = () => {
    setFlash(true);
    setTimeout(() => { setFlash(false); onCapture(); }, 200);
  };
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#0a0a0a", position: "relative", overflow: "hidden",
    }}>
      {/* Flash overlay */}
      {flash && <div style={{ position: "absolute", inset: 0, background: "white", zIndex: 10, opacity: 0.8 }} />}

      {/* Viewfinder simulation */}
      <div style={{
        width: "85%", aspectRatio: "4/3", borderRadius: 12,
        border: "2px solid rgba(255,255,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 8,
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        position: "relative",
      }}>
        {/* Corners */}
        {[[0,0],[1,0],[0,1],[1,1]].map(([x,y],i) => (
          <div key={i} style={{
            position: "absolute",
            [y?"bottom":"top"]: 8, [x?"right":"left"]: 8,
            width: 24, height: 24,
            borderColor: "rgba(255,255,255,0.5)", borderStyle: "solid", borderWidth: 0,
            [y?"borderBottom":"borderTop"]: "2px solid rgba(255,255,255,0.5)",
            [x?"borderRight":"borderLeft"]: "2px solid rgba(255,255,255,0.5)",
          }}/>
        ))}
        <Camera s={32} />
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, fontWeight: 500 }}>{sublabel || "Tap to capture"}</span>
      </div>

      {/* Label */}
      {label && (
        <div style={{
          marginTop: 20, padding: "6px 16px", borderRadius: 8,
          background: "rgba(255,255,255,0.1)",
          fontSize: 14, fontWeight: 600, color: "white",
          letterSpacing: "0.02em",
        }}>
          {label}
        </div>
      )}

      {/* Shutter button */}
      <button onClick={capture} style={{
        marginTop: 24, width: 72, height: 72, borderRadius: "50%",
        border: "4px solid rgba(255,255,255,0.9)",
        background: "rgba(255,255,255,0.15)",
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        transition: "transform 100ms ease",
        position: "relative",
      }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.9)" }} />
      </button>

      <div style={{ height: 20 }} />
    </div>
  );
}

/* ── Main App ────────────────────────────────────────── */
export default function ReceivingApp() {
  const [step, setStep] = useState("select"); // select, bol, truck, count, grid, pallet, condition, done
  const [order, setOrder] = useState(null);
  const [startTime, setStartTime] = useState(null);
  const [bolDone, setBolDone] = useState(false);
  const [truckDone, setTruckDone] = useState(false);
  const [palletCount, setPalletCount] = useState("");
  const [pallets, setPallets] = useState([]); // [{photos: [bool,bool,bool,bool], damaged: bool}]
  const [currentPallet, setCurrentPallet] = useState(null);
  const [currentSide, setCurrentSide] = useState(0);
  const [condition, setCondition] = useState(null);
  const [issues, setIssues] = useState("");
  const [endTime, setEndTime] = useState(null);
  const countRef = useRef(null);

  const selectOrder = (o) => {
    setOrder(o);
    setStartTime(now());
    setStep("bol");
  };

  const confirmCount = () => {
    const n = parseInt(palletCount);
    if (n > 0 && n <= 99) {
      setPallets(Array.from({ length: n }, () => ({ photos: [false, false, false, false], damaged: false })));
      setStep("grid");
    }
  };

  const startPallet = (idx) => {
    setCurrentPallet(idx);
    setCurrentSide(0);
    setStep("pallet");
  };

  const captureSide = () => {
    setPallets(prev => {
      const next = [...prev];
      next[currentPallet] = { ...next[currentPallet], photos: [...next[currentPallet].photos] };
      next[currentPallet].photos[currentSide] = true;
      return next;
    });
    if (currentSide < 3) {
      setCurrentSide(currentSide + 1);
    } else {
      setStep("grid");
    }
  };

  const toggleDamage = () => {
    setPallets(prev => {
      const next = [...prev];
      next[currentPallet] = { ...next[currentPallet], damaged: !next[currentPallet].damaged };
      return next;
    });
  };

  const completedPallets = pallets.filter(p => p.photos.every(Boolean)).length;
  const damagedCount = pallets.filter(p => p.damaged).length;
  const allDone = pallets.length > 0 && completedPallets === pallets.length;

  const finish = () => {
    setEndTime(now());
    setStep("done");
  };

  /* ── HEADER BAR ────────────────────────────────────── */
  const Header = ({ title, onBack, right }) => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 16px", borderBottom: "1px solid #1e293b",
      background: "#0f172a",
      minHeight: 52,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onBack && (
          <button onClick={onBack} style={{
            background: "none", border: "none", color: "#64748b",
            cursor: "pointer", padding: 4, display: "flex",
          }}>
            <ArrowLeft s={20} />
          </button>
        )}
        <span style={{ fontSize: 15, fontWeight: 700, color: "white" }}>{title}</span>
      </div>
      {right}
      {startTime && !right && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#475569", fontSize: 12 }}>
          <Clock s={12} /> {startTime}
        </div>
      )}
    </div>
  );

  /* ── SCREENS ───────────────────────────────────────── */
  return (
    <div style={{
      fontFamily: "'DM Sans', system-ui, sans-serif",
      width: "100%", maxWidth: 430, margin: "0 auto",
      height: "100vh", display: "flex", flexDirection: "column",
      background: "#0b1120", color: "white",
      overflow: "hidden",
      borderRadius: 0,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* ═══ ORDER SELECT ═══════════════════════════════ */}
      {step === "select" && (
        <>
          <Header title="Receiving" />
          <div style={{ flex: 1, padding: "20px 16px", overflowY: "auto" }}>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
              Select an order to begin receiving
            </p>
            {ORDERS.map(o => (
              <button key={o.id} onClick={() => selectOrder(o)} style={{
                width: "100%", padding: "16px", marginBottom: 10,
                background: "#151d2e", border: "1px solid #1e293b",
                borderRadius: 12, cursor: "pointer", textAlign: "left",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 14,
                transition: "border-color 150ms ease",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Truck s={20} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: "white",
                    fontFamily: "'DM Mono', monospace",
                  }}>{o.id}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                    {o.vendor} &middot; {o.desc}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ═══ BOL PHOTO ═════════════════════════════════ */}
      {step === "bol" && (
        <>
          <Header title="Bill of Lading" onBack={() => setStep("select")} />
          <div style={{ padding: "12px 16px", background: "#151d2e", borderBottom: "1px solid #1e293b" }}>
            <div style={{ fontSize: 12, color: "#64748b" }}>Order</div>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{order?.id}</div>
          </div>
          <CameraShutter
            label="BOL Document"
            sublabel="Photograph the Bill of Lading"
            onCapture={() => { setBolDone(true); setStep("truck"); }}
          />
          <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b" }}>
            <label style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px", borderRadius: 8, border: "1px solid #1e293b",
              color: "#64748b", fontSize: 13, cursor: "pointer",
            }}>
              <Upload s={16} /> Choose file instead
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={() => { setBolDone(true); setStep("truck"); }} />
            </label>
          </div>
        </>
      )}

      {/* ═══ TRUCK PHOTO ═══════════════════════════════ */}
      {step === "truck" && (
        <>
          <Header title="Truck Photo" onBack={() => setStep("bol")} />
          <CameraShutter
            label="Truck as opened"
            sublabel="Full view of the open trailer"
            onCapture={() => { setTruckDone(true); setStep("count"); }}
          />
          <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b" }}>
            <label style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px", borderRadius: 8, border: "1px solid #1e293b",
              color: "#64748b", fontSize: 13, cursor: "pointer",
            }}>
              <Upload s={16} /> Choose file instead
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={() => { setTruckDone(true); setStep("count"); }} />
            </label>
          </div>
        </>
      )}

      {/* ═══ PALLET COUNT ══════════════════════════════ */}
      {step === "count" && (
        <>
          <Header title="Pallet Count" onBack={() => setStep("truck")} />
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "0 32px",
          }}>
            <Package s={40} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8", marginTop: 16, marginBottom: 32 }}>
              How many pallets?
            </div>

            <input
              ref={countRef}
              type="number"
              inputMode="numeric"
              value={palletCount}
              onChange={e => { if (e.target.value.length <= 2) setPalletCount(e.target.value); }}
              autoFocus
              placeholder="0"
              style={{
                width: 140, height: 80, textAlign: "center",
                fontSize: 48, fontWeight: 700,
                fontFamily: "'DM Mono', monospace",
                background: "#151d2e", border: "2px solid #1e293b",
                borderRadius: 16, color: "white", outline: "none",
                caretColor: "#3b82f6",
              }}
            />

            <button
              onClick={confirmCount}
              disabled={!palletCount || parseInt(palletCount) < 1}
              style={{
                marginTop: 40, width: "100%", padding: "18px",
                borderRadius: 14, border: "none",
                background: palletCount && parseInt(palletCount) > 0 ? "#3b82f6" : "#1e293b",
                color: palletCount && parseInt(palletCount) > 0 ? "white" : "#475569",
                fontSize: 16, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 200ms ease",
              }}
            >
              {palletCount && parseInt(palletCount) > 0
                ? `Set up ${palletCount} pallet${parseInt(palletCount) > 1 ? "s" : ""}`
                : "Enter count"
              }
            </button>
          </div>
        </>
      )}

      {/* ═══ PALLET GRID ══════════════════════════════ */}
      {step === "grid" && (
        <>
          <Header
            title="Pallets"
            onBack={() => setStep("count")}
            right={
              <button onClick={() => setStep("condition")} style={{
                background: allDone ? "#059669" : "#1e293b",
                border: "none", borderRadius: 8,
                padding: "8px 14px", fontSize: 13, fontWeight: 600,
                color: allDone ? "white" : "#475569",
                cursor: allDone ? "pointer" : "default",
                fontFamily: "inherit",
                transition: "all 200ms ease",
              }}>
                {allDone ? "Continue" : `${completedPallets}/${pallets.length}`}
              </button>
            }
          />
          {/* Progress bar */}
          <div style={{ height: 3, background: "#1e293b" }}>
            <div style={{
              height: "100%", background: "#3b82f6",
              width: `${(completedPallets / pallets.length) * 100}%`,
              transition: "width 300ms ease",
              borderRadius: 2,
            }} />
          </div>

          {/* Stats strip */}
          <div style={{
            display: "flex", padding: "12px 16px", gap: 12,
            borderBottom: "1px solid #1e293b",
          }}>
            <div style={{ flex: 1, padding: "8px 12px", background: "#151d2e", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Done</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#3b82f6", fontVariantNumeric: "tabular-nums" }}>{completedPallets}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 12px", background: "#151d2e", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Remaining</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{pallets.length - completedPallets}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 12px", background: damagedCount > 0 ? "#2d1517" : "#151d2e", borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: damagedCount > 0 ? "#f87171" : "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Damaged</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: damagedCount > 0 ? "#ef4444" : "#475569", fontVariantNumeric: "tabular-nums" }}>{damagedCount}</div>
            </div>
          </div>

          {/* Grid */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "16px",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
            alignContent: "start",
          }}>
            {pallets.map((p, i) => {
              const done = p.photos.every(Boolean);
              const photoCount = p.photos.filter(Boolean).length;
              const partial = photoCount > 0 && !done;
              return (
                <button key={i} onClick={() => startPallet(i)} style={{
                  aspectRatio: "1", borderRadius: 14,
                  border: `2px solid ${p.damaged ? "#dc2626" : done ? "#059669" : partial ? "#3b82f6" : "#1e293b"}`,
                  background: done ? "rgba(5,150,105,0.08)" : partial ? "rgba(59,130,246,0.05)" : "#151d2e",
                  cursor: "pointer", fontFamily: "inherit",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 4,
                  position: "relative", overflow: "hidden",
                  transition: "all 200ms ease",
                }}>
                  {p.damaged && (
                    <div style={{
                      position: "absolute", top: 6, right: 6,
                      width: 20, height: 20, borderRadius: 5,
                      background: "#dc2626",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 11 }}>!</span>
                    </div>
                  )}
                  <span style={{
                    fontSize: 22, fontWeight: 700,
                    fontFamily: "'DM Mono', monospace",
                    color: done ? "#059669" : "white",
                  }}>
                    {i + 1}
                  </span>
                  {/* Photo dots */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {p.photos.map((taken, j) => (
                      <div key={j} style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: taken ? (done ? "#059669" : "#3b82f6") : "#2a3448",
                        transition: "background 200ms ease",
                      }} />
                    ))}
                  </div>
                  {done && (
                    <div style={{ position: "absolute", bottom: 6, color: "#059669" }}>
                      <Check s={16} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ PALLET PHOTO CAPTURE ═════════════════════ */}
      {step === "pallet" && currentPallet !== null && (
        <>
          <Header
            title={`Pallet ${currentPallet + 1}`}
            onBack={() => setStep("grid")}
            right={
              <button onClick={toggleDamage} style={{
                background: pallets[currentPallet]?.damaged ? "#dc2626" : "#1e293b",
                border: `1px solid ${pallets[currentPallet]?.damaged ? "#dc2626" : "#334155"}`,
                borderRadius: 8, padding: "6px 12px",
                display: "flex", alignItems: "center", gap: 6,
                color: pallets[currentPallet]?.damaged ? "white" : "#94a3b8",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 150ms ease",
              }}>
                <Flag s={14} />
                {pallets[currentPallet]?.damaged ? "Damaged" : "Flag"}
              </button>
            }
          />
          {/* Side progress */}
          <div style={{
            display: "flex", padding: "0 16px", gap: 4,
            background: "#0f172a", paddingTop: 8, paddingBottom: 12,
          }}>
            {SIDES.map((side, i) => {
              const taken = pallets[currentPallet]?.photos[i];
              const active = i === currentSide;
              return (
                <div key={side} style={{
                  flex: 1, textAlign: "center",
                  padding: "8px 0", borderRadius: 8,
                  background: active ? "#1e293b" : "transparent",
                  transition: "all 200ms ease",
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 600,
                    color: taken ? "#059669" : active ? "white" : "#475569",
                    letterSpacing: "0.02em",
                  }}>
                    {taken ? "✓ " : ""}{side}
                  </div>
                </div>
              );
            })}
          </div>

          <CameraShutter
            label={`${SIDES[currentSide]} side`}
            sublabel={`Photo ${currentSide + 1} of 4`}
            onCapture={captureSide}
          />

          <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b", display: "flex", gap: 8 }}>
            <label style={{
              flex: 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "10px", borderRadius: 8, border: "1px solid #1e293b",
              color: "#64748b", fontSize: 13, cursor: "pointer",
            }}>
              <Upload s={16} /> Upload
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={captureSide} />
            </label>
            <button onClick={() => setStep("grid")} style={{
              flex: 1, padding: "10px", borderRadius: 8,
              border: "1px solid #1e293b", background: "transparent",
              color: "#64748b", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit",
            }}>
              Back to grid
            </button>
          </div>
        </>
      )}

      {/* ═══ CONDITION / WRAP-UP ═════════════════════ */}
      {step === "condition" && (
        <>
          <Header title="Wrap Up" onBack={() => setStep("grid")} />
          <div style={{ flex: 1, padding: "20px 16px", overflowY: "auto" }}>

            {/* Summary */}
            <div style={{
              padding: "16px", background: "#151d2e", borderRadius: 12,
              marginBottom: 24, border: "1px solid #1e293b",
            }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>Order</span>
                <span style={{ fontWeight: 600, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>{order?.id}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>Pallets</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{pallets.length}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>Photos taken</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{pallets.reduce((s, p) => s + p.photos.filter(Boolean).length, 0) + 2}</span>
              </div>
              {damagedCount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#f87171", fontSize: 13 }}>Damaged pallets</span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#ef4444" }}>{damagedCount}</span>
                </div>
              )}
            </div>

            {/* Condition */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Overall Condition
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {["Good", "Mixed", "Damaged"].map(c => (
                  <button key={c} onClick={() => setCondition(c)} style={{
                    flex: 1, padding: "16px 8px", borderRadius: 12,
                    border: `2px solid ${condition === c
                      ? c === "Good" ? "#059669" : c === "Mixed" ? "#d97706" : "#dc2626"
                      : "#1e293b"}`,
                    background: condition === c
                      ? c === "Good" ? "rgba(5,150,105,0.1)" : c === "Mixed" ? "rgba(217,119,6,0.1)" : "rgba(220,38,38,0.1)"
                      : "#151d2e",
                    cursor: "pointer", fontFamily: "inherit",
                    fontSize: 14, fontWeight: 600,
                    color: condition === c
                      ? c === "Good" ? "#34d399" : c === "Mixed" ? "#fbbf24" : "#f87171"
                      : "#475569",
                    transition: "all 200ms ease",
                  }}>
                    {c === "Good" ? "👍" : c === "Mixed" ? "⚠️" : "🚨"}
                    <div style={{ marginTop: 6 }}>{c}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Issues */}
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 10,
                textTransform: "uppercase", letterSpacing: "0.05em",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                Issues / Notes
                <button style={{
                  background: "#1e293b", border: "none", borderRadius: 8,
                  padding: "6px 10px", display: "flex", alignItems: "center", gap: 5,
                  color: "#64748b", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                }}>
                  <Mic s={14} /> Voice
                </button>
              </div>
              <textarea
                value={issues}
                onChange={e => setIssues(e.target.value)}
                placeholder="Note any issues, missing items, damage details..."
                rows={4}
                style={{
                  width: "100%", padding: "14px",
                  background: "#151d2e", border: "1px solid #1e293b",
                  borderRadius: 12, color: "white", fontSize: 14,
                  fontFamily: "inherit", outline: "none", resize: "none",
                }}
              />
            </div>

            {/* Complete button */}
            <button onClick={finish} disabled={!condition} style={{
              width: "100%", padding: "18px",
              borderRadius: 14, border: "none",
              background: condition ? "#059669" : "#1e293b",
              color: condition ? "white" : "#475569",
              fontSize: 16, fontWeight: 700, cursor: condition ? "pointer" : "default",
              fontFamily: "inherit",
              transition: "all 200ms ease",
            }}>
              Complete Receiving
            </button>
          </div>
        </>
      )}

      {/* ═══ DONE ═════════════════════════════════════ */}
      {step === "done" && (
        <>
          <div style={{
            flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "0 32px", textAlign: "center",
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "rgba(5,150,105,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 20,
            }}>
              <Check s={36} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Receiving Complete
            </div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 32 }}>
              {order?.id} has been received
            </div>

            {/* Stats */}
            <div style={{
              width: "100%", padding: "16px", background: "#151d2e",
              borderRadius: 12, border: "1px solid #1e293b",
              marginBottom: 12, textAlign: "left",
            }}>
              {[
                ["Date", today()],
                ["Duration", `${startTime} - ${endTime}`],
                ["Pallets", `${pallets.length}`],
                ["Photos", `${pallets.reduce((s, p) => s + p.photos.filter(Boolean).length, 0) + 2}`],
                ["Condition", condition],
                ...(damagedCount > 0 ? [["Damaged", `${damagedCount} pallet${damagedCount > 1 ? "s" : ""}`]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: "1px solid #1a2536",
                  fontSize: 13,
                }}>
                  <span style={{ color: "#64748b" }}>{k}</span>
                  <span style={{
                    fontWeight: 600,
                    color: k === "Damaged" ? "#ef4444" : "white",
                  }}>{v}</span>
                </div>
              ))}
            </div>

            {issues && (
              <div style={{
                width: "100%", padding: "12px 16px", background: "#151d2e",
                borderRadius: 12, border: "1px solid #1e293b",
                fontSize: 13, color: "#94a3b8", textAlign: "left",
                marginBottom: 12,
              }}>
                <span style={{ fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase" }}>Notes: </span>
                {issues}
              </div>
            )}

            <button onClick={() => {
              setStep("select"); setOrder(null); setStartTime(null);
              setBolDone(false); setTruckDone(false); setPalletCount("");
              setPallets([]); setCondition(null); setIssues(""); setEndTime(null);
            }} style={{
              width: "100%", padding: "16px",
              borderRadius: 14, border: "1px solid #1e293b",
              background: "#151d2e", color: "white",
              fontSize: 15, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", marginTop: 8,
            }}>
              Back to Orders
            </button>
          </div>
        </>
      )}
    </div>
  );
}
