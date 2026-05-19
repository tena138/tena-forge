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
      <section className="rounded-[14px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.2),transparent_34%),rgba(0,0,0,0.44)] p-6 shadow-forge">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
      </section>
      {children || <Card className="py-12 text-center text-sm text-slate-400">This production surface is wired for Supabase data and ready for implementation-specific UI.</Card>}
    </div>
  );
}
