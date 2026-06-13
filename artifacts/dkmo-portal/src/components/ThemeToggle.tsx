import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
  size?: "sm" | "default";
}

export function ThemeToggle({ className, size = "default" }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "rounded-full transition-all duration-300",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        isDark
          ? "text-yellow-300 hover:bg-white/10 hover:text-yellow-200"
          : "text-green-700/70 hover:bg-green-50 hover:text-green-800",
        className,
      )}
      data-testid="button-theme-toggle"
    >
      {isDark ? (
        <Sun className={cn("transition-transform duration-300 rotate-0", size === "sm" ? "h-4 w-4" : "h-5 w-5")} />
      ) : (
        <Moon className={cn("transition-transform duration-300", size === "sm" ? "h-4 w-4" : "h-5 w-5")} />
      )}
    </Button>
  );
}
