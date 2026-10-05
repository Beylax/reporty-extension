import Image from 'next/image';

export function BrandLogo({ className = '' }: { className?: string }) {
  return <span className={`relative inline-block h-8 w-40 shrink-0 overflow-hidden ${className}`}><Image src="/brand/reporty-logo.png" alt="Reporty" fill sizes="160px" className="object-cover" /></span>;
}
