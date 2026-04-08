import { useEffect, useRef, useState } from 'react';

export interface ImageSourceOption {
  id: string;
  label: string;
  previewUrl: string;
}

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  onSelectFiles: (files: File[], source: 'upload' | 'camera') => Promise<void> | void;
  allowMultipleUpload?: boolean;
  onSelectUrl?: (url: string) => Promise<void> | void;
  existingImages?: ImageSourceOption[];
  selectedExistingImageId?: string | null;
  onSelectExisting?: (imageId: string) => Promise<void> | void;
}

export default function ImageSourceModal({
  open,
  title,
  onClose,
  onSelectFiles,
  allowMultipleUpload = false,
  onSelectUrl,
  existingImages = [],
  selectedExistingImageId,
  onSelectExisting,
}: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setUrlInput('');
    setSubmitting(false);
    setError('');
  }, [open]);

  if (!open) return null;

  async function runAction(action: () => Promise<void> | void) {
    setSubmitting(true);
    setError('');
    try {
      await action();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image action failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileSelection(fileList: FileList | null, source: 'upload' | 'camera') {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    void runAction(() => onSelectFiles(files, source));
  }

  function handleUrlSubmit() {
    if (!onSelectUrl || !urlInput.trim()) return;
    void runAction(() => onSelectUrl(urlInput.trim()));
  }

  function handleExistingSelect(imageId: string) {
    if (!onSelectExisting) return;
    void runAction(() => onSelectExisting(imageId));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-fade-in" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-stone-900"
        onClick={event => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100">{title}</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Choose how to attach the image.</p>
          </div>
          <button onClick={onClose} className="text-stone-400 transition hover:text-stone-600 dark:hover:text-stone-300">
            &times;
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => uploadRef.current?.click()}
            className="rounded-xl border border-stone-200 px-4 py-3 text-left text-sm text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:border-stone-600 dark:hover:bg-stone-800"
          >
            <div className="font-medium">Upload file</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Pick from this device.</div>
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => cameraRef.current?.click()}
            className="rounded-xl border border-stone-200 px-4 py-3 text-left text-sm text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:text-stone-200 dark:hover:border-stone-600 dark:hover:bg-stone-800"
          >
            <div className="font-medium">Take photo</div>
            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Open the device camera.</div>
          </button>
        </div>

        {onSelectUrl && (
          <div className="mt-4 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
            <div className="text-sm font-medium text-stone-700 dark:text-stone-200">Add from URL</div>
            <div className="mt-3 flex gap-2">
              <input
                value={urlInput}
                onChange={event => setUrlInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleUrlSubmit();
                  }
                }}
                placeholder="https://example.com/image.jpg"
                className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200"
              />
              <button
                type="button"
                disabled={submitting || !urlInput.trim()}
                onClick={handleUrlSubmit}
                className="rounded-lg bg-stone-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {existingImages.length > 0 && onSelectExisting && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Use Existing Image</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {existingImages.map(image => {
                const selected = image.id === selectedExistingImageId;
                return (
                  <button
                    key={image.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleExistingSelect(image.id)}
                    className={`overflow-hidden rounded-xl border text-left transition ${selected ? 'border-stone-500 ring-2 ring-stone-300 dark:border-stone-300 dark:ring-stone-600' : 'border-stone-200 hover:border-stone-300 dark:border-stone-700 dark:hover:border-stone-600'}`}
                    title={image.label}
                  >
                    <img src={image.previewUrl} alt={image.label} className="aspect-square w-full object-cover" />
                    <div className="truncate px-2 py-1 text-[11px] text-stone-500 dark:text-stone-400">{image.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <input
          ref={uploadRef}
          type="file"
          accept="image/*"
          multiple={allowMultipleUpload}
          className="hidden"
          onChange={event => {
            handleFileSelection(event.target.files, 'upload');
            event.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={event => {
            handleFileSelection(event.target.files, 'camera');
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}