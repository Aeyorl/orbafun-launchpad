import React from 'react';

/**
 * Mock for next/link — renders a plain <a> tag so tests don't need
 * the full Next.js router context.
 */
export default function MockLink({
  href,
  children,
  className,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  [key: string]: unknown;
}) {
  return (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  );
}
