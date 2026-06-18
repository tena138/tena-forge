import { Card } from "./ui";

export function PageScaffold({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <section className="forge-hero-metal rounded-[12px] border border-white/15 p-6 shadow-forge">
        {eyebrow && <p className="text-xs font-bold uppercase text-neutral-300">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-bold text-white">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-300">{description}</p>
      </section>
      {children || <Card className="py-12 text-center text-sm text-neutral-400">This production surface is wired for Supabase data and ready for implementation-specific UI.</Card>}
    </div>
  );
}
