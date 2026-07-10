"use client";
// components/UploadDropzone.tsx
// Drag-and-drop (or click-to-browse) PDF uploader. Uploads one file at a
// time to /api/invoices/upload and reports progress per file.

import { useCallback, useRef, useState } from "react";

type FileStatus = {
  name: string;
  state: "uploading" | "done" | "error";
  message?: string;
};

export function UploadDropzone({ onUploaded }: { onUploaded: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setFiles((prev) => [...prev, { name: file.name, state: "uploading" }]);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/invoices/upload", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
          setFiles((prev) =>
            prev.map((f) => (f.name === file.name ? { ...f, state: "error", message: data.error } : f))
          );
          return;
        }

        setFiles((prev) => prev.map((f) => (f.name === file.name ? { ...f, state: "done" } : f)));
        onUploaded();
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) => (f.name === file.name ? { ...f, state: "error", message: "Upload failed" } : f))
        );
      }
    },
    [onUploaded]
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      Array.from(fileList)
        .filter((f) => f.type === "application/pdf")
        .forEach(uploadFile);
    },
    [uploadFile]
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors"
        style={{
          borderColor: dragOver ? "var(--accent)" : "var(--border)",
          background: dragOver ? "var(--posted-bg)" : "var(--surface)",
        }}
      >
        <p className="font-medium">Drop invoice PDFs here, or click to browse</p>
        <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
          One or more files · PDF only
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-4 space-y-2">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex items-center justify-between rounded px-3 py-2 text-sm"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <span className="font-ledger">{f.name}</span>
              {f.state === "uploading" && <span style={{ color: "var(--ink-muted)" }}>Extracting…</span>}
              {f.state === "done" && <span style={{ color: "var(--approved-fg)" }}>Done</span>}
              {f.state === "error" && (
                <span style={{ color: "var(--rejected-fg)" }}>{f.message ?? "Failed"}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
