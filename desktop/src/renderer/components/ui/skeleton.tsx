import { cn } from "@/platform/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        `
          animate-[skeleton-breathe_1.4s_ease-in-out_infinite] rounded-md
          bg-surface-2
          motion-reduce:animate-none
        `,
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
