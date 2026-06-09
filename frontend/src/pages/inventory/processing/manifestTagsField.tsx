import Check from '@mui/icons-material/Check';
import Close from '@mui/icons-material/Close';
import { Box, Chip, Grow, Typography } from '@mui/material';
import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import { ManifestFieldNavContext } from './manifestFieldNav';
import type { ManifestModalEditorHandle } from './manifestModalEditor';
import {
  addSearchTag,
  formatSearchTagsCsv,
  MAX_SEARCH_TAGS,
  parseSearchTagsCsv,
} from './processingGoogleQuery';
import { processingTokens } from './processingTokens';

function FieldEditSegment({
  kind,
  onClick,
  onPointerDown,
  ariaLabel,
}: {
  kind: 'save' | 'cancel';
  onClick: () => void;
  onPointerDown?: () => void;
  ariaLabel: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={ariaLabel}
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
        cursor: 'pointer',
        font: 'inherit',
        color: kind === 'save' ? processingTokens.accentGreen : processingTokens.textSoft,
        flexShrink: 0,
        alignSelf: 'stretch',
        transition: (theme) => theme.transitions.create(['background-color', 'color']),
        '&:hover': {
          bgcolor: processingTokens.primarySoftStrong,
          color: processingTokens.textStrong,
        },
      }}
    >
      {kind === 'save' ? <Check sx={{ fontSize: 15 }} /> : <Close sx={{ fontSize: 15 }} />}
    </Box>
  );
}

function TagChip({
  label,
  editing,
  onDelete,
}: {
  label: string;
  editing: boolean;
  onDelete?: () => void;
}) {
  return (
    <Grow in appear timeout={180}>
      <Chip
        label={label}
        size="small"
        onDelete={editing ? onDelete : undefined}
        sx={{
          height: 22,
          maxWidth: '100%',
          fontSize: '0.72rem',
          fontWeight: 600,
          bgcolor: processingTokens.neutralSoft,
          border: `1px solid ${processingTokens.borderStrong}`,
          color: processingTokens.textStrong,
          '& .MuiChip-deleteIcon': {
            fontSize: 15,
            color: processingTokens.textSoft,
            '&:hover': { color: processingTokens.textStrong },
          },
        }}
      />
    </Grow>
  );
}

export interface ManifestTagsFieldProps {
  label?: string;
  value: string;
  onSave: (tags: string[]) => void | Promise<void>;
  presentation?: 'inline' | 'modal';
}

export const ManifestTagsField = forwardRef<ManifestModalEditorHandle, ManifestTagsFieldProps>(
  function ManifestTagsField({ label = 'Tags', value, onSave, presentation = 'inline' }, ref) {
    const nav = useContext(ManifestFieldNavContext);
    const isModal = presentation === 'modal';
    const [editing, setEditing] = useState(isModal);
    const [optimisticCsv, setOptimisticCsv] = useState<string | null>(null);
    const [draftTags, setDraftTags] = useState<string[]>(() => parseSearchTagsCsv(value));
    const [inputBuffer, setInputBuffer] = useState('');
    const editContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const suppressBlurRef = useRef(false);

    const effectiveCsv = optimisticCsv ?? value;
    const displayTags = useMemo(() => parseSearchTagsCsv(effectiveCsv), [effectiveCsv]);

    useEffect(() => {
      if (optimisticCsv != null && value === optimisticCsv) {
        setOptimisticCsv(null);
      }
    }, [value, optimisticCsv]);

    const resetDraft = useCallback(() => {
      setDraftTags(parseSearchTagsCsv(effectiveCsv));
      setInputBuffer('');
    }, [effectiveCsv]);

    const beginEdit = useCallback(() => {
      resetDraft();
      setEditing(true);
    }, [resetDraft]);

    useEffect(() => {
      if (!nav || isModal) return;
      return nav.registerOpener('tags', beginEdit);
    }, [nav, beginEdit, isModal]);

    useEffect(() => {
      if (!editing || isModal) return;
      inputRef.current?.focus();
    }, [editing, isModal]);

    function armSuppressBlur() {
      suppressBlurRef.current = true;
    }

    function releaseSuppressBlur() {
      window.setTimeout(() => {
        suppressBlurRef.current = false;
      }, 0);
    }

    function tagsWithBuffer(tags: string[], buffer: string): string[] {
      return addSearchTag(tags, buffer);
    }

    function cancelEdit() {
      armSuppressBlur();
      resetDraft();
      if (!isModal) setEditing(false);
      releaseSuppressBlur();
    }

    function confirmEdit(tabDirection?: 1 | -1): boolean {
      const nextTags = tagsWithBuffer(draftTags, inputBuffer);
      const nextCsv = formatSearchTagsCsv(nextTags);
      armSuppressBlur();
      setOptimisticCsv(nextCsv);
      setDraftTags(nextTags);
      setInputBuffer('');
      if (!isModal) setEditing(false);
      window.setTimeout(() => {
        releaseSuppressBlur();
        void Promise.resolve(onSave(nextTags)).catch(() => {
          setOptimisticCsv(null);
        });
        if (!isModal && nav && tabDirection) {
          nav.focusAdjacent('tags', tabDirection);
        }
      }, 0);
      return true;
    }

    useImperativeHandle(ref, () => ({
      save: () => confirmEdit(),
      cancel: cancelEdit,
      focusEditor: () => {
        inputRef.current?.focus();
      },
    }));

    function handleBlur(e: FocusEvent) {
      if (isModal) return;
      if (suppressBlurRef.current) return;
      const related = e.relatedTarget as Node | null;
      if (editContainerRef.current?.contains(related)) return;
      cancelEdit();
    }

    function commitBufferToDraft() {
      if (!inputBuffer.trim()) return;
      setDraftTags((prev) => addSearchTag(prev, inputBuffer));
      setInputBuffer('');
    }

    function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isModal) return;
        cancelEdit();
        return;
      }
      if (e.key === 'Tab' && !isModal) {
        e.preventDefault();
        confirmEdit(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'Enter' && !isModal) {
        e.preventDefault();
        confirmEdit();
        return;
      }
      if (e.key === ',' || e.key === ';') {
        e.preventDefault();
        commitBufferToDraft();
        return;
      }
      if (e.key === 'Backspace' && !inputBuffer && draftTags.length > 0) {
        e.preventDefault();
        setDraftTags((prev) => prev.slice(0, -1));
      }
    }

    function handleInputChange(raw: string) {
      if (/[,;]/.test(raw)) {
        const parts = raw.split(/[,;]+/);
        const tail = parts.pop() ?? '';
        let next = draftTags;
        for (const part of parts) {
          next = addSearchTag(next, part);
        }
        setDraftTags(next);
        setInputBuffer(tail);
        return;
      }
      setInputBuffer(raw);
    }

    const shellBorderColor = editing ? processingTokens.borderStrong : 'transparent';
    const tagsToShow = editing ? draftTags : displayTags;
    const atTagLimit = draftTags.length >= MAX_SEARCH_TAGS;

    const editorBody = (
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          alignContent: 'flex-start',
          gap: 0.5,
          minHeight: 44,
          p: 1,
          borderRadius: 1,
          border: '1px solid',
          borderColor: processingTokens.border,
          bgcolor: 'background.paper',
        }}
      >
        {tagsToShow.map((tag) => (
          <TagChip
            key={tag}
            label={tag}
            editing
            onDelete={() => {
              setDraftTags((prev) => prev.filter((t) => t !== tag));
            }}
          />
        ))}
        <Box
          component="input"
          ref={inputRef}
          type="text"
          value={inputBuffer}
          disabled={atTagLimit}
          placeholder={atTagLimit ? 'Tag limit reached' : 'Type tag, then , or ;'}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleInputKeyDown}
          aria-label="Add tag"
          sx={{
            flex: '1 1 120px',
            minWidth: 120,
            border: 0,
            outline: 0,
            bgcolor: 'transparent',
            font: 'inherit',
            fontSize: '0.875rem',
            color: 'text.primary',
            py: 0.25,
            px: 0.25,
            m: 0,
            '&::placeholder': { color: processingTokens.textMute, opacity: 1 },
          }}
        />
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
          sx={{
            display: 'block',
            mb: 0.15,
            minHeight: 14,
            letterSpacing: 0.3,
            fontSize: '0.65rem',
            lineHeight: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Typography>

        <Box
          ref={editContainerRef}
          onClick={!editing ? beginEdit : undefined}
          sx={{
            display: 'flex',
            alignItems: 'stretch',
            minHeight: 28,
            borderRadius: 1,
            border: '1px solid',
            borderColor: shellBorderColor,
            bgcolor: editing ? processingTokens.surfaceTint : 'transparent',
            overflow: 'hidden',
            cursor: editing ? 'default' : 'pointer',
            transition: (theme) =>
              theme.transitions.create(['background-color', 'border-color', 'box-shadow', 'opacity'], { duration: 120 }),
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
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              alignContent: 'center',
              gap: 0.5,
              px: 1,
              py: editing ? 0.5 : 0.35,
            }}
            onClick={editing ? (e) => e.stopPropagation() : undefined}
          >
            {tagsToShow.length ?
              tagsToShow.map((tag) => (
                <TagChip
                  key={tag}
                  label={tag}
                  editing={editing}
                  onDelete={
                    editing ?
                      () => {
                        setDraftTags((prev) => prev.filter((t) => t !== tag));
                      }
                    : undefined
                  }
                />
              ))
            : !editing ?
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled', fontStyle: 'italic' }}>
                Add tags…
              </Typography>
            : null}
            {editing ?
              <Box
                component="input"
                ref={inputRef}
                type="text"
                value={inputBuffer}
                disabled={atTagLimit}
                placeholder={atTagLimit ? 'Tag limit reached' : 'Type tag, then , or ;'}
                onChange={(e) => handleInputChange(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleInputKeyDown}
                aria-label="Add tag"
                sx={{
                  flex: '1 1 88px',
                  minWidth: 88,
                  border: 0,
                  outline: 0,
                  bgcolor: 'transparent',
                  font: 'inherit',
                  fontSize: '0.8125rem',
                  color: 'text.primary',
                  py: 0.25,
                  px: 0.25,
                  m: 0,
                  '&::placeholder': { color: processingTokens.textMute, opacity: 1 },
                }}
              />
            : null}
          </Box>
          {editing ?
            <>
              <FieldEditSegment
                kind="cancel"
                ariaLabel="Cancel tags"
                onPointerDown={armSuppressBlur}
                onClick={cancelEdit}
              />
              <FieldEditSegment kind="save" ariaLabel="Save tags" onPointerDown={armSuppressBlur} onClick={() => confirmEdit()} />
            </>
          : null}
        </Box>
      </Box>
    );
  },
);
