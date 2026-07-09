/**
 * Print dialog: exact template preview, printer health, variables/increments,
 * progress, and partial-failure recovery.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import PrintIcon from '@mui/icons-material/Print';

import { fetchLabelMediaBytes, type CustomLabel } from '../../../api/labels.api';
import { localPrintService, type PrinterInfo } from '../../../services/localPrintService';
import { normalizeDefinition } from './designerState';
import {
  LABEL_RENDER_DPI,
  arrayBufferToBase64,
  canvasToBase64Png,
  loadImage,
  renderLabelToCanvas,
} from './renderTemplate';
import {
  emptyPrintForm,
  hasIncrementVariables,
  incrementExamples,
  parseNumeric,
  type PrintFormState,
  validatePrintForm,
  valuesForCopy,
} from './variableResolve';

export type BackgroundOverride =
  | { mode: 'file'; file: File }
  | { mode: 'clear' };

interface Props {
  label: CustomLabel | null;
  open: boolean;
  onClose: () => void;
  isDraft?: boolean;
  backgroundOverride?: BackgroundOverride;
}

function friendlyPrintError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Printing timed out. Check the printer queue, then try fewer copies.';
  }
  if (error instanceof TypeError) {
    return 'The local print server is unavailable. Start it or check Admin Settings.';
  }
  return error instanceof Error && error.message ? error.message : 'Print failed.';
}

export default function LabelPrintDialog({
  label,
  open,
  onClose,
  isDraft = false,
  backgroundOverride,
}: Props) {
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [printerName, setPrinterName] = useState('');
  const [serverReady, setServerReady] = useState(false);
  const [copies, setCopies] = useState(1);
  const [form, setForm] = useState<PrintFormState>({ text: {}, increment: {} });
  const [printing, setPrinting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const definition = useMemo(
    () =>
      label?.kind === 'template'
        ? normalizeDefinition(label.definition)
        : normalizeDefinition(undefined),
    [label],
  );
  const usesIncrement = hasIncrementVariables(definition);
  const formError = validatePrintForm(definition, form);
  const selectedPrinter = printers.find((printer) => printer.name === printerName);
  const printerWarning =
    selectedPrinter && !['ready', 'idle', 'unknown'].includes(selectedPrinter.status.toLowerCase())
      ? `${selectedPrinter.name}: ${selectedPrinter.status}`
      : null;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDone(null);
    setProgress(null);
    setCopies(1);
    setPreviewIndex(0);
    setForm(emptyPrintForm(definition));
    setServerReady(false);
    let cancelled = false;
    void Promise.all([
      localPrintService.listPrinters(),
      localPrintService.getSettings().catch(() => null),
    ])
      .then(([list, settings]) => {
        if (cancelled) return;
        setPrinters(list);
        setPrinterName(settings?.label_printer ?? '');
        setServerReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setServerReady(false);
          setError('The local print server is offline. Start it or open Admin Settings.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, definition]);

  useEffect(() => {
    if (!open || label?.kind !== 'template') {
      setBackground(null);
      return;
    }
    if (backgroundOverride?.mode === 'clear') {
      setBackground(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    const load = async () => {
      if (backgroundOverride?.mode === 'file') {
        objectUrl = URL.createObjectURL(backgroundOverride.file);
      } else if (label.background_file) {
        const bytes = await fetchLabelMediaBytes(label.id, 'background');
        objectUrl = URL.createObjectURL(new Blob([bytes]));
      } else {
        setBackground(null);
        return;
      }
      const image = await loadImage(objectUrl);
      if (!cancelled) setBackground(image);
    };
    void load().catch((reason) => {
      if (!cancelled) setError(`Background preview failed: ${friendlyPrintError(reason)}`);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, label, backgroundOverride]);

  useEffect(() => {
    if (!open || label?.kind !== 'template' || formError) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renderLabelToCanvas({
        widthIn: Number(label.width_in),
        heightIn: Number(label.height_in),
        definition,
        values: valuesForCopy(definition, form, previewIndex),
        background,
      }).then((canvas) => {
        if (!cancelled) setPreviewUrl(canvas.toDataURL('image/png'));
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, label, definition, form, previewIndex, background, formError]);

  useEffect(() => {
    if (previewIndex >= copies) setPreviewIndex(Math.max(0, copies - 1));
  }, [copies, previewIndex]);

  const handlePrint = async () => {
    if (!label || !serverReady) return;
    const invalid = validatePrintForm(definition, form);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPrinting(true);
    setError(null);
    setDone(null);
    setProgress(null);
    let completed = 0;
    try {
      if (label.kind === 'pdf') {
        if (!label.pdf) throw new Error('Upload a PDF before printing this label.');
        const bytes = await fetchLabelMediaBytes(label.id, 'pdf_file');
        const response = await localPrintService.printPdfCopies({
          pdf_base64: arrayBufferToBase64(bytes),
          copies,
          printer_name: printerName || undefined,
          doc_name: label.slug,
        });
        if (!response.success) throw new Error(response.error || response.message);
        setDone(response.message);
        return;
      }

      if (usesIncrement) {
        for (let index = 0; index < copies; index += 1) {
          setProgress(`Printing ${index + 1} of ${copies}…`);
          const canvas = await renderLabelToCanvas({
            widthIn: Number(label.width_in),
            heightIn: Number(label.height_in),
            definition,
            values: valuesForCopy(definition, form, index),
            background,
          });
          const response = await localPrintService.printImageCopies({
            image_base64: canvasToBase64Png(canvas),
            copies: 1,
            printer_name: printerName || undefined,
            dpi: LABEL_RENDER_DPI,
            doc_name: `${label.slug}-${index + 1}`,
          });
          if (!response.success) throw new Error(response.error || response.message);
          completed = index + 1;
        }
        setDone(`Printed ${copies} unique ${copies === 1 ? 'copy' : 'copies'}.`);
      } else {
        const canvas = await renderLabelToCanvas({
          widthIn: Number(label.width_in),
          heightIn: Number(label.height_in),
          definition,
          values: valuesForCopy(definition, form, 0),
          background,
        });
        const response = await localPrintService.printImageCopies({
          image_base64: canvasToBase64Png(canvas),
          copies,
          printer_name: printerName || undefined,
          dpi: LABEL_RENDER_DPI,
          doc_name: label.slug,
        });
        if (!response.success) throw new Error(response.error || response.message);
        setDone(response.message);
      }
    } catch (reason) {
      const detail = friendlyPrintError(reason);
      setError(
        usesIncrement && completed > 0
          ? `Printed ${completed} of ${copies}; copies ${completed + 1}–${copies} were not sent. ${detail}`
          : detail,
      );
    } finally {
      setPrinting(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onClose={printing ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <span>Print “{label?.name}”</span>
          {isDraft && <Chip size="small" color="warning" label="Draft preview" />}
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ mt: 1 }}>
          <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {done && <Alert severity="success">{done}</Alert>}
            {progress && <Alert severity="info">{progress}</Alert>}
            {!serverReady && (
              <Button href="/admin/settings" variant="outlined">
                Open Admin Settings
              </Button>
            )}
            <TextField
              select
              label="Printer"
              value={printerName}
              onChange={(event) => setPrinterName(event.target.value)}
              helperText="Blank uses the saved label printer."
              disabled={!serverReady}
              fullWidth
            >
              <MenuItem value="">(Saved label printer)</MenuItem>
              {printers.map((printer) => (
                <MenuItem key={printer.name} value={printer.name}>
                  {printer.name} · {printer.status}
                </MenuItem>
              ))}
            </TextField>
            {printerWarning && <Alert severity="warning">{printerWarning}</Alert>}
            <TextField
              label={usesIncrement ? 'Qty (copies)' : 'Copies'}
              type="number"
              value={copies}
              onChange={(event) =>
                setCopies(Math.max(1, Math.min(100, Number(event.target.value) || 1)))
              }
              inputProps={{ min: 1, max: 100 }}
              helperText={
                usesIncrement
                  ? 'Copy 1 uses Start; each later copy adds Step.'
                  : 'Custom templates print at the dimensions set in the designer.'
              }
              fullWidth
            />
            {definition.variables.length > 0 && (
              <>
                <Typography variant="subtitle2">Label fields</Typography>
                {definition.variables.map((variable) =>
                  variable.kind === 'increment' ? (
                    <Box key={variable.key}>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          label={`${variable.name} start`}
                          value={form.increment[variable.key]?.start ?? ''}
                          error={
                            parseNumeric(form.increment[variable.key]?.start ?? '') == null
                          }
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              increment: {
                                ...previous.increment,
                                [variable.key]: {
                                  start: event.target.value,
                                  step:
                                    previous.increment[variable.key]?.step ??
                                    variable.default_step,
                                },
                              },
                            }))
                          }
                          fullWidth
                        />
                        <TextField
                          label="Step"
                          value={form.increment[variable.key]?.step ?? ''}
                          error={parseNumeric(form.increment[variable.key]?.step ?? '') == null}
                          onChange={(event) =>
                            setForm((previous) => ({
                              ...previous,
                              increment: {
                                ...previous.increment,
                                [variable.key]: {
                                  start:
                                    previous.increment[variable.key]?.start ??
                                    variable.default_start,
                                  step: event.target.value,
                                },
                              },
                            }))
                          }
                          fullWidth
                        />
                      </Stack>
                      {(() => {
                        const examples = incrementExamples(
                          variable,
                          form.increment[variable.key],
                        );
                        const step = parseNumeric(form.increment[variable.key]?.step ?? '');
                        return (
                          <>
                            {examples.length > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                First copies: {examples.join(' · ')}
                              </Typography>
                            )}
                            {copies > 1 && step === 0 && (
                              <Alert severity="warning" sx={{ mt: 1 }}>
                                Step is 0, so every copy will show the same value.
                              </Alert>
                            )}
                          </>
                        );
                      })()}
                    </Box>
                  ) : (
                    <TextField
                      key={variable.key}
                      label={variable.name}
                      value={form.text[variable.key] ?? ''}
                      placeholder={variable.default || variable.name}
                      helperText={
                        !variable.default
                          ? `Left blank, this prints as “${variable.name}”.`
                          : undefined
                      }
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          text: { ...previous.text, [variable.key]: event.target.value },
                        }))
                      }
                      fullWidth
                    />
                  ),
                )}
              </>
            )}
          </Stack>

          <Stack spacing={1} sx={{ width: { xs: '100%', md: 360 } }}>
            <Typography variant="subtitle2">Print preview</Typography>
            {label?.kind === 'template' && previewUrl ? (
              <Box
                component="img"
                src={previewUrl}
                alt={`Preview copy ${previewIndex + 1}`}
                sx={{ width: '100%', border: 1, borderColor: 'divider', bgcolor: 'white' }}
              />
            ) : (
              <PaperPreview label={label} />
            )}
            {usesIncrement && copies > 1 && (
              <Stack direction="row" justifyContent="center" alignItems="center">
                <IconNav
                  label="Previous copy"
                  disabled={previewIndex === 0}
                  onClick={() => setPreviewIndex((value) => Math.max(0, value - 1))}
                  icon={<NavigateBeforeIcon />}
                />
                <Typography variant="body2">
                  Copy {previewIndex + 1} of {copies}
                </Typography>
                <IconNav
                  label="Next copy"
                  disabled={previewIndex >= copies - 1}
                  onClick={() =>
                    setPreviewIndex((value) => Math.min(copies - 1, value + 1))
                  }
                  icon={<NavigateNextIcon />}
                />
              </Stack>
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={printing}>
          Close
        </Button>
        <Button
          variant="contained"
          onClick={handlePrint}
          disabled={printing || !label || !serverReady || !!formError || !!printerWarning}
          startIcon={printing ? <CircularProgress size={16} /> : <PrintIcon />}
        >
          Print {copies > 1 ? `× ${copies}` : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PaperPreview({ label }: { label: CustomLabel | null }) {
  return (
    <Alert severity="info">
      {label?.kind === 'pdf' && label.pdf
        ? `PDF file: ${label.pdf.filename}`
        : 'Preview will appear when the label is ready.'}
    </Alert>
  );
}

function IconNav({
  label,
  disabled,
  onClick,
  icon,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <Button aria-label={label} disabled={disabled} onClick={onClick} sx={{ minWidth: 40 }}>
      {icon}
    </Button>
  );
}
