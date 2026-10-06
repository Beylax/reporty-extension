export function BrandLogo({ className = '' }: { className?: string; compact?: boolean; logoUrl?: string }) {
  return <span className={`inline-flex h-8 shrink-0 items-center text-xl font-bold tracking-tight text-foreground ${className}`}>Reporty</span>;
}
