'use client';

import { useRef, useState, useCallback } from 'react';
import { UploadCloud, AlertCircle } from 'lucide-react';
import styles from './file-upload.module.css';

interface FileUploadProps {
  onFile:       (file: File) => void;
  preview?:     string | null;
  isUploading?: boolean;
  error?:       string | null;
  accept?:      string;
  maxSizeMb?:   number;
  label?:       string;
  hint?:        string;
  disabled?:    boolean;
  className?:   string;
}

export function FileUpload({
  onFile,
  preview,
  isUploading = false,
  error,
  accept      = 'image/jpeg,image/png,image/webp',
  maxSizeMb   = 5,
  label       = 'Arrastra un archivo o haz clic para seleccionar',
  hint,
  disabled    = false,
  className,
}: FileUploadProps) {
  const inputRef   = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const resolvedHint = hint ?? `JPG, PNG, WEBP · Máx. ${maxSizeMb}MB`;

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    onFile(files[0]);
  }, [onFile]);

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const zoneCls = [
    styles.zone,
    dragging  ? styles.zoneDragging  : '',
    disabled  ? styles.zoneDisabled  : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div>
      <div
        className={zoneCls}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
      >
        {preview ? (
          <div className={styles.previewWrap}>
            <img src={preview} alt="Preview" className={styles.preview} />
            {isUploading && (
              <div className={styles.previewOverlay}>
                <span className={styles.spinner} />
                Subiendo...
              </div>
            )}
          </div>
        ) : (
          <>
            {isUploading ? (
              <>
                <span className={styles.spinner} style={{ borderColor: 'rgba(99,102,241,0.3)', borderTopColor: '#6366f1' }} />
                <span className={styles.label}>Subiendo...</span>
              </>
            ) : (
              <>
                <UploadCloud size={28} className={styles.uploadIcon} />
                <span className={styles.label}>{label}</span>
                <span className={styles.hint}>{resolvedHint}</span>
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <p className={styles.error}>
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />
    </div>
  );
}
