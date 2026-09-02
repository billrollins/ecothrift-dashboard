import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputBase,
  Typography,
} from '@mui/material';
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dutyColors, thinScrollSx } from '../../components/duty/tokens';
import {
  EMPTY_BRIEF_CONTEXT,
  parseRoutineDoc,
  summarizeChanges,
  type BriefContext,
  type RoutineDoc,
} from './routineJson';

/**
 * Paste or upload a routine document and land it on the form. Nothing is
 * saved here — Apply only fills the editor, so the phone preview shows the
 * result and Save is still the moment of commitment.
 */
export function RoutineJsonDialog({
  open,
  current,
  context = EMPTY_BRIEF_CONTEXT,
  onClose,
  onApply,
}: {
  open: boolean;
  current: RoutineDoc;
  /** Departments and people, so names in the paste resolve to ids and the summary can say who. */
  context?: BriefContext;
  onClose: () => void;
  onApply: (doc: RoutineDoc) => void;
}) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setFileName('');
    }
  }, [open]);

  const result = useMemo(
    () => (text.trim() ? parseRoutineDoc(text, current, context) : null),
    [text, current, context],
  );
  const changes = useMemo(
    () => (result?.ok ? summarizeChanges(current, result.doc, context) : []),
    [result, current, context],
  );

  async function readFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  const status = (() => {
    if (!result) {
      return {
        tone: dutyColors.ink40,
        head: fileName ? `Reading ${fileName}…` : 'Waiting for JSON',
        lines: ['Paste the block your AI returned — prose around it is fine — or upload the file it saved.'],
      };
    }
    if (!result.ok) return { tone: dutyColors.red, head: 'Cannot read this yet', lines: [result.error] };
    if (!changes.length) {
      return { tone: dutyColors.ink60, head: 'Valid, but identical to the form', lines: ['Nothing would change.'] };
    }
    return {
      tone: dutyColors.brandDark,
      head: `Ready — ${changes.length} change${changes.length === 1 ? '' : 's'}`,
      lines: [...changes, ...result.warnings.map((w) => `Note: ${w}`)],
    };
  })();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: '16px' } }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography component="span" sx={{ fontSize: 18, fontWeight: 700, color: dutyColors.ink, display: 'block' }}>
          Update from JSON
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: dutyColors.ink60, mt: 0.25 }}>
          Fills the form. Review the phone, then press Save to keep it.
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '12px',
            border: `1px solid ${result && !result.ok ? dutyColors.red : dutyColors.ink15}`,
            bgcolor: '#FCFCFA',
            overflow: 'hidden',
            '&:focus-within': { borderColor: result && !result.ok ? dutyColors.red : dutyColors.brand },
          }}
        >
          <InputBase
            multiline
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName('');
            }}
            placeholder={'{\n  "format": "ecothrift.routine/1",\n  "title": "…"\n}'}
            inputProps={{ 'aria-label': 'Routine JSON', spellCheck: false }}
            sx={{
              px: 1.5,
              py: 1.25,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12.5,
              lineHeight: 1.5,
              color: dutyColors.ink,
              '& textarea': { height: '220px !important', overflow: 'auto !important', ...thinScrollSx },
            }}
          />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              px: 1.25,
              py: 0.75,
              borderTop: `1px solid ${dutyColors.ink08}`,
              bgcolor: dutyColors.card,
            }}
          >
            <Typography noWrap sx={{ fontSize: 12, color: dutyColors.ink40, minWidth: 0 }}>
              {fileName || `${text.length.toLocaleString()} characters`}
            </Typography>
            <Button
              size="small"
              startIcon={<UploadFileOutlined sx={{ fontSize: 16 }} />}
              onClick={() => fileInput.current?.click()}
              sx={{
                height: 30,
                px: 1.25,
                borderRadius: '8px',
                fontSize: 12.5,
                fontWeight: 700,
                color: dutyColors.brandDark,
                bgcolor: dutyColors.brandSoft,
                '&:hover': { bgcolor: '#D9EEDB' },
              }}
            >
              Upload .json
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,.txt,.md,application/json,text/plain"
              hidden
              onChange={(e) => {
                void readFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </Box>
        </Box>

        <Box
          sx={{
            mt: 1.5,
            px: 1.5,
            py: 1.25,
            height: 132,
            boxSizing: 'border-box',
            borderRadius: '12px',
            bgcolor: dutyColors.paper,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: status.tone }}>
            {status.head}
          </Typography>
          <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2, flex: 1, overflow: 'auto', ...thinScrollSx }}>
            {status.lines.map((line) => (
              <Typography key={line} component="li" sx={{ fontSize: 12.5, color: dutyColors.ink60, lineHeight: 1.5 }}>
                {line}
              </Typography>
            ))}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.5 }}>
        <Button onClick={onClose} sx={{ color: dutyColors.ink60, fontWeight: 700 }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!result?.ok || !changes.length}
          onClick={() => {
            if (result?.ok) onApply(result.doc);
          }}
          sx={{
            borderRadius: '9px',
            fontWeight: 700,
            bgcolor: dutyColors.brand,
            boxShadow: '0 1px 3px rgba(27,94,32,0.28)',
            '&:hover': { bgcolor: dutyColors.brandDark },
          }}
        >
          Apply to form
        </Button>
      </DialogActions>
    </Dialog>
  );
}
