import { useRef, useState } from 'react';
import { parseCsv } from '../lib/csv';
import type { ParsedCsv } from '../lib/csv';

interface Props {
  onParsed: (data: ParsedCsv) => void;
}

export function FileUpload({ onParsed }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const data = await parseCsv(file);
      if (data.headers.length === 0) {
        setError('Could not find any columns in that file. Make sure it is a CSV with a header row.');
        return;
      }
      setFileName(file.name);
      onParsed(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse file.');
    }
  }

  return (
    <div className="upload">
      <div
        className="upload-dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <p className="upload-title">
          {fileName ? `Loaded: ${fileName}` : 'Drop your player CSV here, or click to browse'}
        </p>
        <p className="upload-hint">
          Needs columns for player name, position, cost, and projected points. Export Excel/Sheets as CSV first.
        </p>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
