import Image from "next/image";
import { cn } from "@/lib/utils/cn";

interface AssetImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Only the hero image should opt out of lazy-loading — everything else is below the fold. */
  priority?: boolean;
  sizes?: string;
}

// Every marketing-page image goes through this one component (fills its positioned parent) so
// swapping placeholder art for final photography later is a lib/constants/assets.ts change only.
export function AssetImage({ src, alt, className, priority, sizes }: AssetImageProps) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes ?? "100vw"}
      className={cn("object-cover", className)}
    />
  );
}
