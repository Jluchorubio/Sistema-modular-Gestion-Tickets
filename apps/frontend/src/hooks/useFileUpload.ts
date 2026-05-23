'use client';

import { useState, useRef, useCallback } from 'react';
import { uploadService } from '@/services/upload.service';

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

interface Options {
  accept?:    string[];
  maxSizeMb?: number;
  endpoint?:  string;
  onSuccess?: (url: string) => void;
  onError?:   (msg: string) => void;
}

export interface UseFileUploadReturn {
  inputRef:    React.RefObject<HTMLInputElement>;
  preview:     string | null;
  isUploading: boolean;
  error:       string | null;
  upload:      (file: File) => Promise<string | null>;
  openPicker:  () => void;
  reset:       () => void;
}

export function useFileUpload(options: Options = {}): UseFileUploadReturn {
  const {
    accept    = DEFAULT_ACCEPT,
    maxSizeMb = 5,
    endpoint,
    onSuccess,
    onError,
  } = options;

  const inputRef                      = useRef<HTMLInputElement>(null);
  const [preview,     setPreview]     = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const validate = useCallback((file: File): string | null => {
    if (!accept.includes(file.type)) {
      const exts = accept.map((t) => t.split('/')[1].toUpperCase()).join(', ');
      return `Tipo no permitido. Usa: ${exts}`;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      return `Archivo muy grande. Máximo ${maxSizeMb}MB`;
    }
    return null;
  }, [accept, maxSizeMb]);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      onError?.(validationError);
      return null;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setError(null);
    setIsUploading(true);

    try {
      const url = await uploadService.uploadFile(file, endpoint);
      URL.revokeObjectURL(localUrl);
      setPreview(url);
      onSuccess?.(url);
      return url;
    } catch (err: unknown) {
      URL.revokeObjectURL(localUrl);
      setPreview(null);
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Error al subir el archivo';
      setError(msg);
      onError?.(msg);
      return null;
    } finally {
      setIsUploading(false);
    }
  }, [validate, endpoint, onSuccess, onError]);

  const openPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const reset = useCallback(() => {
    setPreview(null);
    setError(null);
    setIsUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  return { inputRef, preview, isUploading, error, upload, openPicker, reset };
}
