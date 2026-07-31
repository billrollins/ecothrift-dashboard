import type { JSONContent } from '@tiptap/core';

export type RichTextEditorVariant = 'blog' | 'email';
export type RichTextEditorValue = string | JSONContent | null;

export interface RichTextEditorChange {
  html: string;
  json: JSONContent;
  text: string;
}

export interface RichTextEditorSelection {
  text: string;
  from: number;
  to: number;
}

export interface RichTextEditorProps {
  value: RichTextEditorValue;
  onChange: (value: RichTextEditorChange) => void;
  placeholder?: string;
  editable?: boolean;
  variant: RichTextEditorVariant;
  uploadImage?: (file: File) => Promise<{ url: string; alt?: string }>;
  onSelectionChange?: (selection: RichTextEditorSelection) => void;
  className?: string;
}
