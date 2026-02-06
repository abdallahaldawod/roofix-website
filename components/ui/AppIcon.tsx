"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

export type AppIconProps = {
  /** Icon name including set prefix (e.g. "lucide:clock") */
  name: string;
  /** Size in pixels; applied to width and height. Default 20. */
  size?: number;
  className?: string;
};

const DEFAULT_SIZE = 20;

/**
 * Renders Iconify icon only after mount so server and client output match
 * (avoids hydration mismatch from @iconify/react’s client-only SVG rendering).
 */
export function AppIcon({ name, size = DEFAULT_SIZE, className }: AppIconProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sizePx = `${size}px`;
  const baseClassName = `shrink-0 text-neutral-600 ${className ?? ""}`.trim();

  if (!mounted) {
    return (
      <span
        className={baseClassName}
        style={{ width: sizePx, height: sizePx, display: "inline-block" }}
        aria-hidden
      />
    );
  }

  return (
    <Icon
      icon={name}
      width={size}
      height={size}
      className={baseClassName}
      aria-hidden
    />
  );
}
