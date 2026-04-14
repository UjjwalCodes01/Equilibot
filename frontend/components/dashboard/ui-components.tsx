"use client";

import React from "react";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function GlassPanel({
  title,
  subtitle,
  children,
  className,
}: Readonly<{
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cx(
        "rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl",
        className
      )}
    >
      {title || subtitle ? (
        <div className="mb-5 flex flex-col gap-1 border-b border-white/8 pb-4">
          {title ? <h4 className="font-serif text-2xl text-stone-50">{title}</h4> : null}
          {subtitle ? <p className="text-sm leading-6 text-zinc-400">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function EmptyState({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return (
    <div className="rounded-3xl border border-dashed border-white/15 bg-black/20 px-5 py-8 text-center">
      <p className="text-sm font-medium text-stone-50">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-400">{detail}</p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  suffix,
}: Readonly<{ label: string; value: string | number; suffix?: string }>) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">{label}</p>
      <p className="mt-2 font-serif text-2xl text-stone-50">
        {value}
        {suffix ? <span className="ml-1 text-sm text-amber-200/80">{suffix}</span> : null}
      </p>
    </div>
  );
}

export function SectionLabel({
  icon: Icon,
  title,
  description,
}: Readonly<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}>) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10 text-amber-200">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h5 className="font-medium text-stone-50">{title}</h5>
        <p className="text-sm leading-6 text-zinc-400">{description}</p>
      </div>
    </div>
  );
}
