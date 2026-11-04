/**
 * An uploaded PDF's pages, each at the container's width, with something drawn over each page (the boxes). The
 * boxes are fractions of the page as shown (top-left origin), the same contract the server flattens with
 * (apps/esign/placed.py), so they land in the same place on any screen.
 *
 * react-pdf with its pdf.js worker bundled locally (no CDN).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Document, Page, pdfjs } from 'react-pdf';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl as string;

export interface PageSize {
  /** 1-based. */
  page: number;
  width: number;
  height: number;
}

export function PdfPages({ data, overlay, onPageClick, gap = 16 }: {
  data: ArrayBuffer;
  /** Drawn over each page, positioned absolutely within it. */
  overlay?: (size: PageSize) => ReactNode;
  /** A click on a page, as fractions of the page. */
  onPageClick?: (page: number, x: number, y: number) => void;
  gap?: number;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(600);
  const [pages, setPages] = useState(0);
  const [sizes, setSizes] = useState<Record<number, PageSize>>({});
  const [failed, setFailed] = useState(false);
  // pdf.js takes the bytes over (the buffer is detached), so hand it a copy, made once.
  const file = useMemo(() => ({ data: new Uint8Array(data.slice(0)) }), [data]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setWidth(Math.max(240, Math.floor(el.getBoundingClientRect().width)));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  return (
    <Box ref={wrap} sx={{ width: '100%' }} data-testid="pdf-pages">
      <Document file={file} onLoadSuccess={({ numPages }) => setPages(numPages)} onLoadError={() => setFailed(true)}
        loading={<Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress size={26} /></Box>}
        error={<Box sx={{ p: 3, textAlign: 'center' }}>The PDF did not open. Refresh and try again.</Box>}>
        {failed ? null : Array.from({ length: pages }, (_, i) => {
          const size = sizes[i + 1];
          return (
            <Box key={i} data-page={i + 1}
              onClick={onPageClick ? (e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onPageClick(i + 1, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
              } : undefined}
              sx={{ position: 'relative', width, mb: `${gap}px`, bgcolor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                cursor: onPageClick ? 'crosshair' : 'default' }}>
              <Page pageNumber={i + 1} width={width} renderTextLayer={false} renderAnnotationLayer={false}
                onRenderSuccess={(p) => setSizes((all) => (all[i + 1]?.width === p.width && all[i + 1]?.height === p.height
                  ? all : { ...all, [i + 1]: { page: i + 1, width: p.width, height: p.height } }))} />
              {size && overlay ? overlay(size) : null}
            </Box>
          );
        })}
      </Document>
    </Box>
  );
}

const KIND_WORDS: Record<string, string> = {
  signature: 'Signature', initials: 'Initials', name: 'Printed name', title: 'Title', date: 'Date',
};
export const boxWord = (kind: string) => KIND_WORDS[kind] ?? kind;
