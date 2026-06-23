import Image from "next/image";
import type { Attachment } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon, FileTextIcon, FileSpreadsheetIcon, FileImageIcon } from "./icons";

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;
  const isImage = contentType?.startsWith("image");
  const isPDF = contentType === "application/pdf";
  const isSpreadsheet = contentType?.includes("spreadsheet") || contentType?.includes("excel") || contentType === "text/csv";
  const isDocument = contentType?.startsWith("text") || isPDF || isSpreadsheet;

  const getFileIcon = () => {
    if (isPDF) return <FileTextIcon className="size-8 text-red-500" />;
    if (isSpreadsheet) return <FileSpreadsheetIcon className="size-8 text-green-500" />;
    if (isDocument) return <FileTextIcon className="size-8 text-blue-500" />;
    return <FileImageIcon className="size-8 text-muted-foreground" />;
  };

  return (
    <div
      className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted"
      data-testid="input-attachment-preview"
    >
      {isImage ? (
        <Image
          alt={name ?? "attachment"}
          className="size-full object-cover"
          height={96}
          src={url}
          width={96}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          {getFileIcon()}
          <span className="text-xs truncate w-full px-1 text-center">{name ?? "file"}</span>
        </div>
      )}

      {isUploading && (
        <div
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm"
          data-testid="input-attachment-loader"
        >
          <Spinner className="size-5" />
        </div>
      )}

      {onRemove && !isUploading && (
        <button
          className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <CrossSmallIcon size={10} />
        </button>
      )}
    </div>
  );
};
