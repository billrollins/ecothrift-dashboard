/**
 * The signing screens, in the Thrift+ member sign-up's style: one step per screen, "Step n of N", big touch targets, a
 * finger signature. Steps: Read, [Confirm: each statement ticked], Agree (consent tick + name + title), Sign,
 * [W-9, link signers only, when asked], Done.
 *
 * The same screens serve a link (`/sign?t=...`, no login) and a signed-in signer inside the host (`contained`).
 * An uploaded PDF shows its pages on the Read step, with this signer's boxes marked; their one drawn signature goes
 * into every signature box of theirs.
 * Used / expired / cancelled / not-your-turn say so in plain words.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, InputBase } from '@mui/material';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { errText, type PlacedBox, type SigningSource, type SigningState } from './api';
import FingerPad, { type FingerPadHandle } from './FingerPad';
import { PdfPages, boxWord, type PageSize } from './PdfPages';
import { sc, u } from './theme';
import { BigButton, ErrorLine, Shell, heading, line } from './ui';

export type StepId = 'read' | 'confirm' | 'agree' | 'sign' | 'w9';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });
}

/** The frozen text: "## Heading" lines become headings. Shown exactly as it will be hashed and signed. */
export function DocumentText({ text, compact = false }: { text: string; compact?: boolean }) {
  const blocks = text.trim().split('\n\n');
  const size = (n: number) => (compact ? `${Math.round(n * 0.55)}px` : u(n));
  return (
    <Box data-testid="document-text" sx={{ fontSize: size(28), lineHeight: 1.5, color: sc.ink }}>
      <Box component="h2" sx={{ m: 0, mb: size(16), fontSize: size(38), fontFamily: sc.display, fontWeight: 500, color: sc.title }}>{blocks[0]}</Box>
      {blocks.slice(1).map((block, i) =>
        block.startsWith('## ') ? (
          <Box key={i}>
            <Box component="h3" sx={{ m: 0, mt: size(20), mb: size(6), fontSize: size(31) }}>{block.split('\n')[0].slice(3)}</Box>
            <Box sx={{ whiteSpace: 'pre-wrap' }}>{block.split('\n').slice(1).join('\n')}</Box>
          </Box>
        ) : (
          <Box key={i} sx={{ whiteSpace: 'pre-wrap', mt: size(12) }}>{block}</Box>
        ))}
    </Box>
  );
}

function Field({ label, value, onChange, testId, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; testId: string; autoComplete?: string;
}) {
  return (
    <Box sx={{ mt: u(26) }}>
      <Box component="label" sx={{ display: 'block', fontSize: u(28), fontWeight: 600, color: sc.ink, mb: u(10) }}>{label}</Box>
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        inputProps={{ 'data-testid': testId, 'aria-label': label }}
        sx={{
          width: '100%', minHeight: u(104), px: u(30), borderRadius: u(30), bgcolor: sc.card, border: `${u(3)} solid ${sc.cardEdge}`,
          fontSize: u(36), boxShadow: sc.tileShadow,
        }}
      />
    </Box>
  );
}

function Tick({ checked, onChange, children, testId }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; testId: string }) {
  return (
    <Box component="label" sx={{ mt: u(22), display: 'flex', gap: u(20), alignItems: 'flex-start', p: u(24), borderRadius: u(24), bgcolor: sc.accentTint, cursor: 'pointer' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
        style={{ width: 34, height: 34, marginTop: 4, flexShrink: 0, accentColor: sc.accent }}
      />
      <Box sx={{ fontSize: u(29), lineHeight: 1.4, color: sc.ink, fontWeight: 500 }}>{children}</Box>
    </Box>
  );
}

/** This signer's boxes over a page: where their signature, name and date will go. */
function MyBoxes({ boxes, size }: { boxes: PlacedBox[]; size: PageSize }) {
  return (
    <>
      {boxes.filter((b) => b.page === size.page).map((b, i) => (
        <Box key={i} data-testid="my-box" sx={{
          position: 'absolute', left: b.x * size.width, top: b.y * size.height, width: b.w * size.width, height: b.h * size.height,
          border: `2px dashed ${sc.accent}`, bgcolor: 'rgba(255, 214, 102, 0.28)', borderRadius: '4px', display: 'flex',
          alignItems: 'flex-end', overflow: 'hidden', pointerEvents: 'none',
        }}>
          <Box component="span" sx={{ fontSize: 11, lineHeight: 1.2, fontWeight: 700, color: sc.accentDeep, px: '3px' }}>
            {b.kind === 'signature' ? 'You sign here' : b.kind === 'date' ? 'Date' : b.kind === 'name' ? 'Your name' : `Your ${boxWord(b.kind).toLowerCase()}`}
          </Box>
        </Box>
      ))}
    </>
  );
}

const GONE_TITLES: Record<string, string> = {
  used: 'Already signed', expired: 'This link has expired', void: 'Cancelled', invalid: 'Link not valid', waiting: 'Not your turn yet',
};

export function SignerFlow({ source, contained = false, finishHint }: {
  source: SigningSource;
  /** Inside the host's own page (a signed-in signer) instead of filling the window. */
  contained?: boolean;
  /** Shown on the done screen, e.g. where the signed copy will be. */
  finishHint?: string;
}) {
  const [doc, setDoc] = useState<SigningState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [consent, setConsent] = useState(false);
  const [ticks, setTicks] = useState<boolean[]>([]);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [inked, setInked] = useState(false);
  // The drawing, kept when the Sign step is left (the pad unmounts before the optional W-9 step).
  const [signature, setSignature] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [done, setDone] = useState<{ complete: boolean } | null>(null);
  const [pdf, setPdf] = useState<ArrayBuffer | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const pad = useRef<FingerPadHandle | null>(null);
  const file = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    source.load()
      .then((d) => {
        if (!live) return;
        setDoc(d);
        if (d.ok) {
          setName(d.signer_name ?? '');
          setTitle(d.signer_title ?? '');
          setTicks((d.acknowledgments ?? []).map(() => false));
          if (d.source === 'pdf') {
            source.pdf().then((bytes) => live && setPdf(bytes)).catch(() => live && setPdfFailed(true));
          }
        }
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, [source]);

  const statements = useMemo(() => doc?.acknowledgments ?? [], [doc?.acknowledgments]);
  const steps: StepId[] = useMemo(() => {
    const out: StepId[] = ['read'];
    if (statements.length) out.push('confirm');
    out.push('agree', 'sign');
    if (doc?.requires_w9 && source.uploadW9) out.push('w9');
    return out;
  }, [statements.length, doc?.requires_w9, source.uploadW9]);

  if (loadFailed) {
    return (
      <Shell testId="sign-error" contained={contained}>
        <Box sx={{ p: u(48) }}><Box component="h1" sx={heading}>Something went wrong</Box><Box sx={line}>We could not open this page. Check your connection and try again.</Box></Box>
      </Shell>
    );
  }
  if (!doc) {
    return <Shell testId="sign-loading" contained={contained}><Box sx={{ display: 'grid', placeItems: 'center', flex: 1 }}><CircularProgress /></Box></Shell>;
  }
  if (!doc.ok) {
    return (
      <Shell testId={`sign-gone-${doc.state}`} contained={contained}>
        <Box sx={{ p: u(48), pt: u(120) }}>
          <Box component="h1" sx={heading}>{GONE_TITLES[doc.state] ?? 'Link not valid'}</Box>
          <Box data-testid="sign-gone-message" sx={{ ...line, fontSize: u(34), color: sc.ink }}>{doc.detail}</Box>
        </Box>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell testId="sign-done" contained={contained}>
        <Box sx={{ textAlign: 'center', p: u(48), pt: u(140) }}>
          <CheckCircleRounded aria-hidden sx={{ fontSize: u(150), color: sc.done }} />
          <Box component="h1" sx={{ ...heading, mt: u(14) }}>You're all set</Box>
          <Box sx={{ ...line, fontSize: u(34), color: sc.ink }}>
            {done.complete
              ? 'Thank you. Everyone has now signed.'
              : 'Thank you. The others still need to sign; the signed copy comes once everyone has.'}
          </Box>
          {finishHint ? <Box sx={{ ...line, fontSize: u(28) }}>{finishHint}</Box> : null}
          {!contained ? <Box sx={{ ...line, fontSize: u(28) }}>You can close this page. The link will not open again.</Box> : null}
        </Box>
      </Shell>
    );
  }

  const step = steps[stepIndex];
  const signatureBoxes = (doc.boxes ?? []).filter((b) => b.kind === 'signature').length;
  const count = steps.length;
  const last = stepIndex === count - 1;

  const next = () => {
    setErr('');
    if (step === 'confirm' && !ticks.every(Boolean)) return setErr('Tick every statement to go on.');
    if (step === 'agree') {
      if (!consent) return setErr('Tick the box to sign electronically.');
      if (name.trim().length < 3) return setErr('Type your full legal name.');
    }
    setStepIndex((i) => Math.min(i + 1, count - 1));
  };

  const send = async (drawn: string) => {
    setBusy(true);
    try {
      const res = await source.sign({ name: name.trim(), title: title.trim(), consent, acknowledgments: ticks, signature: drawn });
      if (res.ok && res.signed) setDone({ complete: Boolean(res.complete) });
      else setDoc({ ok: false, state: res.state ?? 'invalid', detail: res.detail });
    } catch (e) {
      setErr(errText(e, 'Could not save your signature. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  /** The Sign step's button: keep the drawing, then sign now (no W-9 step) or move to the W-9 step. */
  const signStep = async () => {
    setErr('');
    const png = await pad.current?.toBlob();
    if (!png) {
      setErr('The signature did not save. Clear it and sign again.');
      return;
    }
    const drawn = await blobToDataUrl(png);
    setSignature(drawn);
    if (last) await send(drawn);
    else setStepIndex((i) => i + 1);
  };

  const chooseFile = async (f: File | undefined) => {
    if (!f || !source.uploadW9) return;
    setErr('');
    setBusy(true);
    try {
      const res = await source.uploadW9(f);
      if (res.ok) setUploaded(true);
      else setErr(res.detail ?? 'That file did not upload.');
    } catch (e) {
      setErr(errText(e, 'That file did not upload. Use a PDF, JPG or PNG under 10 MB.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell testId="sign-flow" contained={contained}>
      <Box sx={{ px: u(40), pt: `calc(env(safe-area-inset-top, 0px) + ${u(30)})`, pb: u(10), flexShrink: 0 }}>
        <Box data-testid="sign-progress" sx={{ fontSize: u(28), fontWeight: 600, color: sc.accentDeep, letterSpacing: '0.04em' }}>
          Step {stepIndex + 1} of {count}
        </Box>
        <Box aria-hidden sx={{ display: 'flex', gap: u(10), mt: u(10) }}>
          {steps.map((s, i) => (
            <Box key={s} sx={{ flex: 1, height: u(12), borderRadius: 99, bgcolor: i <= stepIndex ? sc.accent : sc.line }} />
          ))}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: u(40), pt: u(24), pb: `calc(${u(44)} + env(safe-area-inset-bottom, 0px))` }}>
        {step === 'read' && (
          <Box data-testid="step-read">
            <Box component="h1" sx={heading}>{doc.title}</Box>
            <Box sx={line}>
              {doc.company ? `${doc.company} sent this to ` : 'Sent to '}{doc.signer_name}{doc.role_label ? ` (${doc.role_label})` : ''}. Read it all, then continue.
            </Box>
            <Box tabIndex={0} role="region" aria-label="The document"
              sx={{ mt: u(24), height: u(780), overflowY: 'auto', overscrollBehavior: 'contain', p: u(28), borderRadius: u(24), bgcolor: sc.card, border: `${u(3)} solid ${sc.cardEdge}` }}>
              {doc.source === 'pdf' ? (
                pdfFailed ? <Box sx={line}>The PDF did not open. Check your connection and open this page again.</Box>
                  : pdf ? <PdfPages data={pdf} overlay={(size) => <MyBoxes boxes={doc.boxes ?? []} size={size} />} />
                    : <Box sx={{ display: 'grid', placeItems: 'center', py: u(80) }}><CircularProgress /></Box>
              ) : <DocumentText text={doc.text ?? ''} />}
            </Box>
            {doc.source === 'pdf' ? (
              <Box sx={{ ...line, fontSize: u(26) }}>
                {doc.page_count} page{doc.page_count === 1 ? '' : 's'}. The marked boxes are yours: your signature, name and date go there.
              </Box>
            ) : null}
          </Box>
        )}
        {step === 'confirm' && (
          <Box data-testid="step-confirm">
            <Box component="h1" sx={heading}>Confirm each one</Box>
            <Box sx={line}>Tick each statement. Each tick is recorded with your signature.</Box>
            {statements.map((s, i) => (
              <Tick key={i} checked={ticks[i] ?? false} testId={`ack-${i}`}
                onChange={(v) => setTicks((all) => all.map((t, j) => (j === i ? v : t)))}>
                {s}
              </Tick>
            ))}
          </Box>
        )}
        {step === 'agree' && (
          <Box data-testid="step-agree">
            <Box component="h1" sx={heading}>Agree and name yourself</Box>
            <Box sx={line}>Your typed name and your drawn signature are your signature on the document you just read.</Box>
            <Tick checked={consent} onChange={setConsent} testId="consent-tick">{doc.consent}</Tick>
            <Field label="Your full legal name" value={name} onChange={setName} testId="signer-name" autoComplete="name" />
            <Field label="Your title (optional)" value={title} onChange={setTitle} testId="signer-title" autoComplete="organization-title" />
          </Box>
        )}
        {step === 'sign' && (
          <Box data-testid="step-sign">
            <Box component="h1" sx={heading}>Sign here</Box>
            <Box sx={line}>
              Draw your signature in the box, with a finger or the mouse.
              {doc.source === 'pdf' ? ` It goes in ${signatureBoxes === 1 ? 'the box' : `all ${signatureBoxes} boxes`} marked for you.` : ''}
            </Box>
            <Box sx={{ mt: u(24) }}>
              <FingerPad ref={pad} onInk={setInked} disabled={busy} />
            </Box>
            <Box sx={{ mt: u(8), fontSize: u(26), color: sc.ink2, lineHeight: 1.4 }}>
              Signing as {name.trim()}{title.trim() ? `, ${title.trim()}` : ''}.
            </Box>
          </Box>
        )}
        {step === 'w9' && (
          <Box data-testid="step-w9">
            <Box component="h1" sx={heading}>Your W-9 (optional)</Box>
            <Box sx={line}>You can add a signed W-9 now, or send it later. Only the owner can open it.</Box>
            <input ref={file} hidden type="file" accept="application/pdf,image/png,image/jpeg" data-testid="w9-input"
              onChange={(e) => void chooseFile(e.target.files?.[0])} />
            <Box sx={{ mt: u(30), display: 'flex' }}>
              <BigButton onClick={() => file.current?.click()} busy={busy} testId="w9-choose">
                {uploaded ? 'Replace my W-9' : 'Choose my W-9'}
              </BigButton>
            </Box>
            {uploaded && <Box data-testid="w9-received" sx={{ mt: u(20), fontSize: u(30), fontWeight: 600, color: sc.accentDeep }}>W-9 received.</Box>}
          </Box>
        )}
        {err && <ErrorLine>{err}</ErrorLine>}
        <Box sx={{ mt: u(30), display: 'flex', flexDirection: 'column', gap: u(18) }}>
          {step === 'sign' ? (
            <BigButton primary onClick={() => void signStep()} disabled={!inked} busy={busy} testId="sign-submit">
              {last ? 'Sign' : 'Continue'}
            </BigButton>
          ) : step === 'w9' ? (
            <BigButton primary onClick={() => void send(signature)} busy={busy} testId="sign-submit">
              {uploaded ? 'Sign and finish' : 'Skip and sign'}
            </BigButton>
          ) : (
            <BigButton primary onClick={next} testId="step-next">
              {step === 'read' ? "I've read it" : 'Continue'}
            </BigButton>
          )}
          {stepIndex > 0 && (
            <BigButton onClick={() => setStepIndex((i) => i - 1)} disabled={busy} testId="step-back">Back</BigButton>
          )}
        </Box>
      </Box>
    </Shell>
  );
}
