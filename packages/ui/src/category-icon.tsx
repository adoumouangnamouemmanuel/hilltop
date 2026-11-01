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
  Bike,
  Briefcase,
  Camera,
  Dumbbell,
  Gamepad2,
  Gift,
  Leaf,
  Music,
  Palette,
  Scissors,
  Sofa,
  Watch,
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
  Bike,
  Briefcase,
  Camera,
  Dumbbell,
  Gamepad2,
  Gift,
  Leaf,
  Music,
  Palette,
  Scissors,
  Sofa,
  Watch,
};

/** Icon names admins can pick for a category. */
export const categoryIconNames = Object.keys(icons).sort();

/** Renders a category's icon by name, so categories from the API can pick their own. */
export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = icons[name] ?? Shapes;
  return <Icon className={className} aria-hidden />;
}
