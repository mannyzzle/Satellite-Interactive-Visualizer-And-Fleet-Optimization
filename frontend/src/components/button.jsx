import { cn } from "../lib/utils";

export function Button({ children, className, ...props }) {
  return (
    <button
      className={cn(
        "px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-teal-300 transition-all duration-300",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
