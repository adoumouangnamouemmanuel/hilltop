import {
  BedDouble,
  BookOpen,
  Cable,
  Calculator,
  Droplets,
  Gem,
  Glasses,
  Headphones,
  Laptop,
  Package,
  Shapes,
  Shirt,
  Smartphone,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  BedDouble,
  BookOpen,
  Cable,
  Calculator,
  Droplets,
  Gem,
  Glasses,
  Headphones,
  Laptop,
  Package,
  Shapes,
  Shirt,
  Smartphone,
  Ticket,
  UtensilsCrossed,
};

/** Renders a category's icon by name, so categories from the API can pick their own. */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = icons[name] ?? Shapes;
  return <Icon className={className} aria-hidden />;
}
