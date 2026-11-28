import * as React from "react";
import { cn } from "cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full py-2.5 rounded-lg bg-field px-3.5 text-base transition-[background-color,box-shadow] placeholder:text-muted-foreground/80 hover:not-focus-visible:not-disabled:inset-ring hover:not-focus-visible:not-disabled:inset-ring-input focus-visible:bg-background focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:inset-ring-2 aria-invalid:inset-ring-destructive md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
