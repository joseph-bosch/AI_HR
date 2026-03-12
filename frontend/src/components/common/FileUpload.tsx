import { useCallback, useState } from 'react';
import { Upload, File, X } from 'lucide-react';
import { motion } from 'framer-motion';

const containerVariants = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };
const itemVariants = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } } };

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  uploading?: boolean;
}

export default function FileUpload({
  onFilesSelected,
  multiple = false,
  accept = '.pdf,.docx',
  uploading = false,
}: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles(files);
    onFilesSelected(files);
  }, [onFilesSelected]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(files);
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  const removeFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
  };

  return (
    <div className="space-y-3">
      <div
        className={`glass-card rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
          dragActive
            ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-500/10'
            : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/50'
        } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <div style={{ animation: 'float 3s ease-in-out infinite' }}>
          <Upload className="w-10 h-10 mx-auto mb-3 text-slate-400" />
        </div>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-blue-600">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-slate-400 mt-1">PDF or DOCX files{multiple ? ' (multiple allowed)' : ''}</p>
        <input
          id="file-input"
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {selectedFiles.length > 0 && (
        <motion.ul
          className="space-y-2"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {selectedFiles.map((file, i) => (
            <motion.li key={i} variants={itemVariants} className="flex items-center gap-2 text-sm glass-card rounded-lg px-3 py-2">
              <File className="w-4 h-4 text-slate-400" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</span>
              <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
