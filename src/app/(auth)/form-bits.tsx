"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { siGoogle } from "simple-icons";
import { Glyph } from "@/components/platform-icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** The white card on the right of the auth screens, with an optional grey footer band. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-background shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
      <div className="p-7 sm:p-12">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {subtitle ? <div className="mt-2 text-[15px] text-muted-foreground">{subtitle}</div> : null}
        <div className="mt-8">{children}</div>
      </div>
      {footer ? <div className="border-t bg-muted/50 px-7 py-6 text-center text-[15px] sm:px-12">{footer}</div> : null}
    </div>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  aside,
  ...props
}: ComponentProps<typeof Input> & { label: string; name: string; error?: string; hint?: string; aside?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={name} className="text-[15px]">
          {label}
        </Label>
        {aside}
      </div>
      <Input id={name} name={name} aria-invalid={error ? true : undefined} className="h-12 rounded-lg px-4 text-[15px]" {...props} />
      {error ? <p className="text-sm text-destructive">{error}</p> : hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SubmitButton({ children, className, disabled }: { children: ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(
        "flex h-12 w-full items-center justify-center rounded-lg bg-brand text-[16px] font-semibold text-brand-foreground transition hover:bg-brand/90 disabled:opacity-60",
        className,
      )}
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-7 flex items-center gap-4 text-sm text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GoogleButton({ label }: { label: string }) {
  return (
    <button type="submit" className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border bg-background text-[15px] font-medium transition hover:bg-muted/60">
      <Glyph path={siGoogle.path} className="size-5" />
      {label}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mb-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{message}</p>;
}

export function FormNotice({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mb-5 rounded-lg bg-brand-soft px-4 py-3 text-sm">{message}</p>;
}

export const linkClass = "font-medium text-brand underline underline-offset-4 hover:text-brand/80";
