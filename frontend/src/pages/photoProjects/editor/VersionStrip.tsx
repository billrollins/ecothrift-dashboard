/**
 * The versions strip under the picture (Dash #209): Raw first (no X), then every version in the order made. Tap one
 * to look at it; the next Edit or AI run starts from it. X greys the tile in place with Undo for 5 seconds; the star
 * makes the version on screen Main. A running AI version holds its own slot (a working tile), so nothing moves.
 */
import { useEffect, useRef } from 'react';
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ReplayRounded from '@mui/icons-material/ReplayRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StarBorderRounded from '@mui/icons-material/StarBorderRounded';
import type { PhotoVersionDTO, ProjectPhotoDTO } from '../../../api/photoProjects.api';
import { SIDE_SCROLL } from '../../../components/photoEditor/EditTools';
import { CHECKER } from '../../../components/photoEditor/PicturePreview';
import { useObjectUrl, usePictureBlob } from './pictures';

interface Props {
  photo: ProjectPhotoDTO;
  /** The version on screen; null = Raw. */
  selected: number | null;
  onSelect: (version: number | null) => void;
  /** Versions greyed with Undo (deleted when the 5 seconds are up). */
  deleting: ReadonlySet<number>;
  onDelete: (version: number) => void;
  onUndo: (version: number) => void;
  onStar: (version: number | null) => void;
  onRetry: (version: number) => void;
  layout: 'desk' | 'phone';
}

const GREEN = '#2e7d32';

function kindLine(v: PhotoVersionDTO): string {
  const kind = v.kind === 'ai' ? 'AI' : 'Edit';
  if (v.status === 'working') return `${kind} · working`;
  if (v.status === 'failed') return `${kind} · failed`;
  return kind;
}

function Tile({ photo, version, selected, main, showMain, deleting, layout, onSelect, onDelete, onUndo, onStar, onRetry }: {
  photo: ProjectPhotoDTO;
  version: PhotoVersionDTO | null;
  selected: boolean;
  main: boolean;
  showMain: boolean;
  deleting: boolean;
  layout: 'desk' | 'phone';
  onSelect: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onStar: () => void;
  onRetry: () => void;
}) {
  const desk = layout === 'desk';
  const size = desk ? 96 : 62;
  const done = version == null || version.status === 'done';
  const thumb = usePictureBlob(photo.id, version?.id ?? null, 'thumb', done);
  const url = useObjectUrl(thumb.data);
  const radius = desk ? '10px' : '9px';
  return (
    <Box sx={{ width: size, flex: 'none' }} data-testid={version ? `version-${version.id}` : 'version-raw'}>
      <Box
        role="button"
        tabIndex={0}
        aria-label={version ? version.caption || 'Version' : 'Raw'}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect();
        }}
        sx={{
          position: 'relative', width: size, height: size, borderRadius: radius, border: '1px solid #dfe3dc', cursor: 'pointer',
          background: version?.see_through ? CHECKER : version?.status === 'failed' ? '#fdecea' : version?.status === 'working' ? '#f3f4f0' : '#fff',
          outline: selected ? `3px solid ${GREEN}` : 'none', outlineOffset: 2,
        }}
      >
        {url && done ? (
          <Box component="img" src={url} alt="" draggable={false} sx={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: radius, display: 'block' }} />
        ) : null}
        {version?.status === 'working' ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={desk ? 26 : 22} thickness={5} />
          </Box>
        ) : null}
        {version?.status === 'failed' ? (
          <ButtonBase
            aria-label="Run again"
            title={version.error || 'Run again'}
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            sx={{ position: 'absolute', inset: 0, borderRadius: radius, color: '#c62828', flexDirection: 'column', gap: 0.25 }}
          >
            <ReplayRounded sx={{ fontSize: desk ? 28 : 24 }} />
            {desk ? <Typography sx={{ fontSize: 11, fontWeight: 700 }}>Run again</Typography> : null}
          </ButtonBase>
        ) : null}
        {main && showMain ? (
          <Box sx={{ position: 'absolute', left: desk ? 5 : 3, top: desk ? 5 : 3, display: 'flex', alignItems: 'center', gap: 0.25, bgcolor: '#1b5e20', color: '#fff', fontSize: desk ? 10.5 : 10, fontWeight: 800, px: desk ? 0.75 : 0.5, py: '1px', borderRadius: '9px', pointerEvents: 'none' }}>
            <StarRounded sx={{ fontSize: 12 }} />
            {desk ? 'Main' : null}
          </Box>
        ) : selected && done && showMain && !deleting ? (
          <ButtonBase
            aria-label="Make this Main"
            title="Make this Main"
            onClick={(e) => {
              e.stopPropagation();
              onStar();
            }}
            sx={{ position: 'absolute', left: 3, top: 3, width: 24, height: 24, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.92)', color: GREEN, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
          >
            <StarBorderRounded sx={{ fontSize: 18 }} />
          </ButtonBase>
        ) : null}
        {!version && !desk ? (
          <Box sx={{ position: 'absolute', left: 3, bottom: 3, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 700, px: 0.625, borderRadius: '6px', pointerEvents: 'none' }}>
            Raw
          </Box>
        ) : null}
        {version && !deleting ? (
          <ButtonBase
            aria-label="Delete this version"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            sx={{ position: 'absolute', right: -7, top: -7, width: 22, height: 22, borderRadius: '50%', bgcolor: '#fff', border: '1px solid #c9cfc6', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', color: '#333' }}
          >
            <CloseRounded sx={{ fontSize: 14 }} />
          </ButtonBase>
        ) : null}
        {deleting ? (
          <ButtonBase
            aria-label="Undo delete"
            onClick={(e) => {
              e.stopPropagation();
              onUndo();
            }}
            sx={{ position: 'absolute', inset: 0, borderRadius: radius, bgcolor: 'rgba(90,96,92,0.72)', color: '#fff', fontWeight: 800, fontSize: desk ? 14 : 12.5 }}
          >
            Undo
          </ButtonBase>
        ) : null}
      </Box>
      {desk ? (
        <Box sx={{ height: 46, mt: 0.75, overflow: 'hidden', opacity: deleting ? 0.5 : 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {version ? version.caption || 'Version' : 'Raw'}
          </Typography>
          {version ? <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.3 }}>{kindLine(version)}</Typography> : null}
        </Box>
      ) : null}
    </Box>
  );
}

export function VersionStrip({ photo, selected, onSelect, deleting, onDelete, onUndo, onStar, onRetry, layout }: Props) {
  const rowRef = useRef<HTMLDivElement>(null);
  const count = useRef(photo.versions.length);
  const desk = layout === 'desk';
  const showMain = photo.versions.some((v) => v.status === 'done');

  // A new version (a run started, an edit saved) is brought into view at the end of the strip.
  useEffect(() => {
    const el = rowRef.current;
    if (el && photo.versions.length > count.current) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    count.current = photo.versions.length;
  }, [photo.versions.length]);

  return (
    <Box
      ref={rowRef}
      data-testid="version-strip"
      sx={{ display: 'flex', gap: desk ? 1.75 : 1.5, ...(desk ? { overflowX: 'auto' } : SIDE_SCROLL), overflowY: 'hidden', pt: '10px', pb: desk ? 0.5 : 1, px: desk ? 1 : 1.75, flex: 'none' }}
    >
      {[null, ...photo.versions].map((v) => {
        const id = v?.id ?? null;
        return (
          <Tile
            key={id ?? 'raw'}
            photo={photo}
            version={v}
            selected={selected === id}
            main={photo.main === id}
            showMain={showMain}
            deleting={id != null && deleting.has(id)}
            layout={layout}
            onSelect={() => onSelect(id)}
            onDelete={() => id != null && onDelete(id)}
            onUndo={() => id != null && onUndo(id)}
            onStar={() => onStar(id)}
            onRetry={() => id != null && onRetry(id)}
          />
        );
      })}
    </Box>
  );
}
