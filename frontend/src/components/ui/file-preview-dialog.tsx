"use client";

import React, { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@radix-ui/react-scroll-area";
import { Copy, Download, FileText, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { tasksApi } from "@/lib/api-client";

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
}

interface FileContent {
  file_path: string;
  content: string;
  file_type: string;
  file_size: number;
  lines: number;
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  filePath,
}: FilePreviewDialogProps) {
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load file content when dialog opens
  React.useEffect(() => {
    if (open && filePath) {
      loadFileContent();
    } else {
      setFileContent(null);
      setError(null);
    }
  }, [open, filePath]);

  const loadFileContent = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await tasksApi.getFileContent(filePath);
      setFileContent(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || "Nie udało się załadować pliku";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (fileContent?.content) {
      try {
        await navigator.clipboard.writeText(fileContent.content);
        toast.success("Zawartość skopiowana do schowka");
      } catch (error) {
        toast.error("Nie udało się skopiować do schowka");
      }
    }
  };

  const downloadFile = () => {
    if (fileContent?.content) {
      const blob = new Blob([fileContent.content], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filePath.split("/").pop() || "file.txt";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Plik został pobrany");
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getLanguageFromFileType = (fileType: string) => {
    switch (fileType) {
      case "go":
        return "go";
      case "python":
        return "python";
      case "bash":
        return "bash";
      case "cpp":
        return "cpp";
      case "javascript":
        return "javascript";
      default:
        return "text";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-none w-[90vw] h-[90vh] p-0 flex flex-col"
        style={{ width: '90vw', height: '90vh', maxWidth: '90vw', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-background">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <div>
              <h2 className="text-lg font-semibold">Podgląd pliku</h2>
              <p className="text-sm text-muted-foreground truncate max-w-[60vw]">
                {filePath}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {fileContent && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{fileContent.file_type}</Badge>
                <Badge variant="outline">{formatFileSize(fileContent.file_size)}</Badge>
                <Badge variant="outline">{fileContent.lines} linii</Badge>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Ładowanie pliku...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full text-destructive">
              <span>{error}</span>
            </div>
          )}

          {fileContent && !isLoading && !error && (
            <>
              {/* Action buttons */}
              <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Kopiuj
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadFile}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Pobierz
                </Button>
              </div>

              {/* Code content with scroll */}
              <div className="flex-1 overflow-auto">
                <SyntaxHighlighter
                  language={getLanguageFromFileType(fileContent.file_type)}
                  style={oneDark}
                  showLineNumbers={true}
                  wrapLines={false}
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    fontSize: '0.875rem',
                    lineHeight: '1.5',
                    height: '100%',
                    minHeight: '100%',
                    background: '#1e1e1e',
                  }}
                  lineNumberStyle={{
                    minWidth: '3em',
                    paddingRight: '1em',
                    textAlign: 'right',
                    userSelect: 'none',
                  }}
                >
                  {fileContent.content}
                </SyntaxHighlighter>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
