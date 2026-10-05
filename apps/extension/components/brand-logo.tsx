export function BrandLogo({ className = '', compact = false, logoUrl }: { className?: string; compact?: boolean; logoUrl?: string }) {
  return <span className={`inline-flex h-8 ${compact ? 'w-8' : 'w-36'} shrink-0 items-center justify-center overflow-hidden ${className}`}><img src={logoUrl ?? browser.runtime.getURL(compact ? '/brand/reporty-symbol.png' : '/brand/reporty-logo.png')} alt="Reporty" className={compact ? 'size-full object-contain' : 'h-auto w-full max-w-none shrink-0'} /></span>;
}
