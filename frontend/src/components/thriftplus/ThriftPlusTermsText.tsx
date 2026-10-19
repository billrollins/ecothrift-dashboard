/**
 * The Thrift+ terms as a customer reads them before signing (Join v2, owner 2026-10-19: the member app's "Sign the
 * terms"): word for word from the public site's copy (one source, J5), the same text Finalize's terms popup shows.
 * Plain text in the parent's colours; `size` is the body's font size and `gap` the space between paragraphs.
 */
import { Box } from '@mui/material';
import { THRIFT_PLUS_TERMS_EN as TERMS } from '../../../../frontend-public/src/data/thriftPlusTerms.en';

export default function ThriftPlusTermsText({ size, gap, muted }: { size: string; gap: string; muted: string }) {
  const p = { m: 0, mt: gap, fontSize: size, lineHeight: 1.45 } as const;
  const h = { m: 0, mt: `calc(${gap} * 2)`, fontSize: `calc(${size} * 1.1)`, fontWeight: 800 } as const;
  const list = { m: 0, pl: `calc(${size} * 1.4)` } as const;
  return (
    <>
      <Box component="h3" sx={{ ...h, mt: 0 }}>{TERMS.needToKnowTitle}</Box>
      <Box component="ul" sx={list}>
        {TERMS.needToKnow.map((l) => (
          <Box component="li" key={l.label} sx={p}><b>{l.label}</b> {l.text}</Box>
        ))}
      </Box>
      <Box component="p" sx={{ ...p, mt: `calc(${gap} * 2)` }}>
        <b>{TERMS.fullIntro.label}</b> {TERMS.fullIntro.text} · {TERMS.fullIntro.version}
      </Box>
      {TERMS.sections.map((s) => (
        <Box key={s.num}>
          <Box component="h3" sx={h}>{`${s.num}. ${s.title}`}</Box>
          {s.clauses.map((c, i) => (
            <Box key={c.n ?? i}>
              <Box component="p" sx={p}>
                {c.n ? <Box component="span" sx={{ color: muted, fontWeight: 700 }}>{`${c.n} `}</Box> : null}
                {c.label ? <b>{c.label}</b> : null}
                {c.label && c.text ? ' ' : null}
                {c.text}
              </Box>
              {c.steps ? (
                <Box component="ol" sx={list}>
                  {c.steps.map((x) => <Box component="li" key={x} sx={p}>{x}</Box>)}
                </Box>
              ) : null}
              {c.points ? (
                <Box component="ul" sx={list}>
                  {c.points.map((x) => <Box component="li" key={x.label} sx={p}><b>{x.label}</b> {x.text}</Box>)}
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      ))}
    </>
  );
}
