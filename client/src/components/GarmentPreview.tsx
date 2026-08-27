/**
 * Style: «Тихий ателье» — безопасный локальный предпросмотр Blob-изображений без сетевых запросов.
 */
import { useEffect, useState } from "react";

interface GarmentPreviewProps {
  image: string | Blob;
  alt: string;
  className?: string;
}

export default function GarmentPreview({ image, alt, className }: GarmentPreviewProps) {
  const [source, setSource] = useState("");

  useEffect(() => {
    if (typeof image === "string") {
      setSource(image);
      return;
    }
    const objectUrl = URL.createObjectURL(image);
    setSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [image]);

  if (!source) return null;
  return <img src={source} alt={alt} className={className} />;
}

