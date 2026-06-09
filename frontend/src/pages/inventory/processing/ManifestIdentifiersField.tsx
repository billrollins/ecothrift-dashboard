import Add from '@mui/icons-material/Add';
import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import {
  Box,
  Chip,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ManifestFieldNavContext } from './manifestFieldNav';
import type { ManifestModalEditorHandle } from './manifestModalEditor';
import {
  draftRowsToIdentifiers,
  IDENTIFIER_PRESET_KEYS,
  identifierLabel,
  identifiersDisplayOrder,
  identifiersToDraftRows,
  newIdentifierDraftRow,
  normalizeIdentifiersObject,
  type IdentifierDraftRow,
  validateIdentifierDraftRows,
} from './processingIdentifiers';
import { processingTokens } from './processingTokens';

function FieldEditSegment({
  kind,
  onClick,
  onPointerDown,
  disabled,
  ariaLabel,
}: {
  kind: 'save' | 'cancel';
  onClick: () => void;
  onPointerDown?: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onMouseDown={(e) => {
        e.preventDefault();
        onPointerDown?.();
      }}
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 0.75,
        minWidth: 30,
        m: 0,
        border: 0,
        borderLeft: '1px solid',
        borderColor: processingTokens.border,
        bgcolor: processingTokens.clearSegmentBg,
        cursor: disabled ? 'default' : 'pointer',
        font: 'inherit',
        color: kind === 'save' ? processingTokens.accentGreen : processingTokens.textSoft,
        flexShrink: 0,
        alignSelf: 'stretch',
        opacity: disabled ? 0.45 : 1,
        transition: (theme) => theme.transitions.create(['background-color', 'color']),
        '&:hover':
          disabled ? {}
          : {
              bgcolor: processingTokens.primarySoftStrong,
              color: processingTokens.textStrong,
            },
      }}
    >
      {kind === 'save' ? <Check sx={{ fontSize: 15 }} /> : <Close sx={{ fontSize: 15 }} />}
    </Box>
  );
}

function IdentifierChip({ label, value }: { label: string; value: string }) {
  return (
    <Chip
      label={
        <Box component="span" sx={{ display: 'inline-flex', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
          <Box component="span" sx={{ color: processingTokens.textSoft, fontWeight: 600, flexShrink: 0 }}>
            {label}
          </Box>
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value}
          </Box>
        </Box>
      }
      size="small"
      sx={{
        height: 22,
        maxWidth: '100%',
        fontSize: '0.72rem',
        fontWeight: 600,
        bgcolor: processingTokens.neutralSoft,
        border: `1px solid ${processingTokens.borderStrong}`,
        color: processingTokens.textStrong,
      }}
    />
  );
}

export interface ManifestIdentifiersFieldProps {
  label?: string;
  value: Record<string, unknown>;
  onSave: (identifiers: Record<string, string>) => void | Promise<void>;
  presentation?: 'inline' | 'modal';
}

export const ManifestIdentifiersField = forwardRef<ManifestModalEditorHandle, ManifestIdentifiersFieldProps>(
  function ManifestIdentifiersField(
    { label = 'Identifiers', value, onSave, presentation = 'inline' },
    ref,
  ) {
    const nav = useContext(ManifestFieldNavContext);
    const isModal = presentation === 'modal';
    const [editing, setEditing] = useState(isModal);
    const [optimisticValue, setOptimisticValue] = useState<Record<string, string> | null>(null);
    const [draftRows, setDraftRows] = useState<IdentifierDraftRow[]>(() => identifiersToDraftRows(value));
    const [validationError, setValidationError] = useState<string | null>(null);
    const editContainerRef = useRef<HTMLDivElement>(null);
    const suppressBlurRef = useRef(false);
    const firstKeyInputRef = useRef<HTMLInputElement>(null);

    const effectiveValue = optimisticValue ?? normalizeIdentifiersObject(value);
    const displayKeys = useMemo(() => identifiersDisplayOrder(Object.keys(effectiveValue)), [effectiveValue]);
    const isEmpty = displayKeys.length === 0;

    useEffect(() => {
      if (optimisticValue != null) {
        const current = normalizeIdentifiersObject(value);
        const same =
          Object.keys(current).length === Object.keys(optimisticValue).length
          && Object.entries(optimisticValue).every(([k, v]) => current[k] === v);
        if (same) setOptimisticValue(null);
      }
    }, [value, optimisticValue]);

    const resetDraft = useCallback(() => {
      const rows = identifiersToDraftRows(effectiveValue);
      setDraftRows(rows.length ? rows : [newIdentifierDraftRow()]);
      setValidationError(null);
    }, [effectiveValue]);

    const beginEdit = useCallback(() => {
      resetDraft();
      setEditing(true);
    }, [resetDraft]);

    useEffect(() => {
      if (!nav || isModal) return;
      return nav.registerOpener('identifiers', beginEdit);
    }, [nav, beginEdit, isModal]);

    function armSuppressBlur() {
      suppressBlurRef.current = true;
    }

    function releaseSuppressBlur() {
      window.setTimeout(() => {
        suppressBlurRef.current = false;
      }, 0);
    }

    function cancelEdit() {
      armSuppressBlur();
      resetDraft();
      if (!isModal) setEditing(false);
      releaseSuppressBlur();
    }

    function confirmEdit(tabDirection?: 1 | -1): boolean {
      const err = validateIdentifierDraftRows(draftRows);
      if (err) {
        setValidationError(err);
        return false;
      }
      const next = draftRowsToIdentifiers(draftRows);
      armSuppressBlur();
      setOptimisticValue(next);
      setValidationError(null);
      if (!isModal) setEditing(false);
      window.setTimeout(() => {
        releaseSuppressBlur();
        void Promise.resolve(onSave(next)).catch(() => {
          setOptimisticValue(null);
        });
        if (!isModal && nav && tabDirection) {
          nav.focusAdjacent('identifiers', tabDirection);
        }
      }, 0);
      return true;
    }

    useImperativeHandle(ref, () => ({
      save: () => confirmEdit(),
      cancel: cancelEdit,
      focusEditor: () => {
        firstKeyInputRef.current?.focus();
        firstKeyInputRef.current?.select();
      },
    }));

    function handleShellKeyDown(e: KeyboardEvent) {
      if (!editing || isModal) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        confirmEdit(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        confirmEdit();
      }
    }

    function updateRow(id: string, patch: Partial<IdentifierDraftRow>) {
      setDraftRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
      setValidationError(null);
    }

    function removeRow(id: string) {
      setDraftRows((prev) => prev.filter((row) => row.id !== id));
      setValidationError(null);
    }

    const shellBorderColor = editing ? processingTokens.borderStrong : 'transparent';

    const editorBody = (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {draftRows.map((row, index) => (
          <Box key={row.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
            <TextField
              size="small"
              variant="outlined"
              placeholder="Key"
              value={row.key}
              inputRef={index === 0 ? firstKeyInputRef : undefined}
              onChange={(e) => updateRow(row.id, { key: e.target.value })}
              slotProps={{
                htmlInput: {
                  list: 'manifest-identifier-preset-keys',
                },
              }}
              sx={{ width: 140, flexShrink: 0 }}
            />
            <TextField
              size="small"
              variant="outlined"
              placeholder="Value"
              value={row.value}
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
              sx={{ flex: 1, minWidth: 0 }}
            />
            <IconButton
              size="small"
              aria-label="Remove identifier"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => removeRow(row.id)}
            >
              <DeleteOutline sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
          <IconButton
            size="small"
            aria-label="Add identifier"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setDraftRows((prev) => [...prev, newIdentifierDraftRow()])}
          >
            <Add sx={{ fontSize: 16 }} />
          </IconButton>
          <Typography variant="caption" color="text.secondary">
            Add identifier
          </Typography>
        </Box>
        {validationError ?
          <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
            {validationError}
          </Typography>
        : null}
        <datalist id="manifest-identifier-preset-keys">
          {IDENTIFIER_PRESET_KEYS.map((key) => (
            <option key={key} value={key} label={identifierLabel(key)} />
          ))}
        </datalist>
      </Box>
    );

    if (isModal) {
      return editorBody;
    }

    return (
      <Box sx={{ minWidth: 0, py: 0.35, px: 0.75 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={editing ? 600 : 400}
          sx={{ display: 'block', mb: 0.15, minHeight: 14, letterSpacing: 0.3, fontSize: '0.65rem', lineHeight: 1.2, textTransform: 'uppercase' }}
        >
          {label}
        </Typography>

        <Box
          ref={editContainerRef}
          onClick={!editing ? beginEdit : undefined}
          onKeyDown={handleShellKeyDown}
          tabIndex={editing ? -1 : 0}
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            minHeight: editing ? 72 : 28,
            borderRadius: 1,
            border: '1px solid',
            borderColor: shellBorderColor,
            bgcolor: editing ? processingTokens.surfaceTint : 'transparent',
            overflow: 'hidden',
            cursor: editing ? 'default' : 'pointer',
            transition: (theme) =>
              theme.transitions.create(['background-color', 'border-color', 'box-shadow'], { duration: 120 }),
            boxShadow: 'none',
            ...(!editing ?
              {
                '&:hover': {
                  bgcolor: 'action.hover',
                  borderColor: processingTokens.border,
                },
              }
            : {}),
          }}
        >
          {editing ?
            <Box sx={{ flex: 1, minWidth: 0, p: 0.75 }}>{editorBody}</Box>
          : <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, px: 1, py: 0.35 }}>
              {isEmpty ?
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.disabled', fontStyle: 'italic' }}>
                  Add identifier
                </Typography>
              : displayKeys.map((key) => (
                  <IdentifierChip key={key} label={identifierLabel(key)} value={effectiveValue[key] ?? ''} />
                ))
              }
            </Box>
          }
          {editing ?
            <>
              <FieldEditSegment kind="cancel" ariaLabel="Cancel identifiers" onPointerDown={armSuppressBlur} onClick={cancelEdit} />
              <FieldEditSegment kind="save" ariaLabel="Save identifiers" onPointerDown={armSuppressBlur} onClick={() => confirmEdit()} />
            </>
          : null}
        </Box>
      </Box>
    );
  },
);
