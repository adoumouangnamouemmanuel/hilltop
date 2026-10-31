/*
 * The category catalog. Each category declares its own attributes, and the rest of
 * the app (filters, listing specs, the sell form) is generated from this schema.
 * New categories can arrive from the API or be created by sellers at runtime.
 */

export type AttributeDef = {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "boolean";
  options?: string[];
  unit?: string;
  placeholder?: string;
  /** Shown as a filter when browsing this category. */
  filter?: boolean;
};

export type CategoryDef = {
  id: string;
  label: string;
  /** Lucide icon name, resolved in components/category-icon.tsx. */
  icon: string;
  blurb: string;
  cover?: string;
  attributes: AttributeDef[];
  /** Food and similar items have no "used" condition. */
  noCondition?: boolean;
  /** Created by a seller rather than the platform. */
  custom?: boolean;
};

export const unsplash = (id: string, w = 1600) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format`;

const brand = (options: string[]): AttributeDef => ({ key: "brand", label: "Brand", type: "select", options: [...options, "Other"], filter: true });

export const baseCategories: CategoryDef[] = [
  {
    id: "phones",
    label: "Phones",
    icon: "Smartphone",
    blurb: "iPhones, Android, feature phones",
    cover: unsplash("1510557880182-3d4d3cba35a5", 800),
    attributes: [
      brand(["Apple", "Samsung", "Tecno", "Infinix", "Xiaomi", "Google"]),
      { key: "model", label: "Model", type: "text", placeholder: "e.g. iPhone 12" },
      { key: "storage", label: "Storage", type: "select", options: ["32GB", "64GB", "128GB", "256GB", "512GB"], filter: true },
      { key: "battery", label: "Battery health", type: "number", unit: "%" },
      { key: "network", label: "Network", type: "select", options: ["Unlocked", "Locked to MTN", "Locked to Telecel"], filter: true },
      { key: "colour", label: "Colour", type: "text" },
    ],
  },
  {
    id: "computers",
    label: "Laptops & computers",
    icon: "Laptop",
    blurb: "Laptops, monitors, keyboards",
    cover: unsplash("1496181133206-80ce9b88a853", 800),
    attributes: [
      brand(["Apple", "Dell", "HP", "Lenovo", "Asus", "Acer", "Logitech"]),
      { key: "type", label: "Type", type: "select", options: ["Laptop", "Tablet", "Monitor", "Keyboard", "Mouse", "Accessory"], filter: true },
      { key: "processor", label: "Processor", type: "text", placeholder: "e.g. Intel Core i5" },
      { key: "ram", label: "Memory", type: "select", options: ["4GB", "8GB", "16GB", "32GB"], filter: true },
      { key: "storage", label: "Storage", type: "select", options: ["128GB", "256GB", "512GB", "1TB"], filter: true },
      { key: "screen", label: "Screen size", type: "text", placeholder: "e.g. 14 inches" },
    ],
  },
  {
    id: "audio",
    label: "Earphones & audio",
    icon: "Headphones",
    blurb: "Earbuds, earpieces, speakers",
    cover: unsplash("1572569511254-d8f925fe2cbb", 800),
    attributes: [
      brand(["Apple", "Sony", "JBL", "Samsung", "Oraimo", "Jabra"]),
      { key: "type", label: "Type", type: "select", options: ["Earbuds", "Over-ear", "Wired earphones", "Earpiece", "Speaker"], filter: true },
      { key: "connection", label: "Connection", type: "select", options: ["Bluetooth", "Wired", "Both"], filter: true },
      { key: "anc", label: "Noise cancelling", type: "boolean", filter: true },
      { key: "battery", label: "Battery life", type: "text", placeholder: "e.g. 6 hours" },
    ],
  },
  {
    id: "accessories",
    label: "Cases & chargers",
    icon: "Cable",
    blurb: "Phone cases, chargers, power banks",
    cover: unsplash("1601593346740-925612772716", 800),
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Phone case", "Charger", "Power bank", "Cable", "Screen protector", "Laptop sleeve"], filter: true },
      { key: "fits", label: "Fits", type: "text", placeholder: "e.g. iPhone 12, USB-C laptops" },
      brand(["Apple", "Samsung", "Oraimo", "Anker"]),
    ],
  },
  {
    id: "calculators",
    label: "Calculators",
    icon: "Calculator",
    blurb: "Scientific, graphing, basic",
    cover: unsplash("1611125832047-1d7ad1e8e48f", 800),
    attributes: [
      { key: "model", label: "Model", type: "select", options: ["Casio fx-991ES Plus", "Casio fx-991EX", "Casio fx-82MS", "TI-84 Plus", "Basic", "Desk calculator"], filter: true },
      { key: "exam", label: "Allowed in exams", type: "boolean", filter: true },
      { key: "power", label: "Power", type: "select", options: ["Solar and battery", "Battery", "Solar"] },
    ],
  },
  {
    id: "books",
    label: "Books",
    icon: "BookOpen",
    blurb: "Textbooks, novels, course packs",
    cover: unsplash("1497633762265-9d179a990aa6", 800),
    attributes: [
      { key: "subject", label: "Subject", type: "select", options: ["Maths", "Computer Science", "Business", "Engineering", "Economics", "Humanities", "Fiction"], filter: true },
      { key: "course", label: "Course code", type: "text", placeholder: "e.g. MATH 141" },
      { key: "author", label: "Author", type: "text" },
      { key: "edition", label: "Edition", type: "text" },
      { key: "format", label: "Format", type: "select", options: ["Paperback", "Hardcover", "Course pack", "Bundle"], filter: true },
      { key: "notes", label: "Has notes or highlights", type: "boolean", filter: true },
    ],
  },
  {
    id: "eyewear",
    label: "Glasses",
    icon: "Glasses",
    blurb: "Prescription, sunglasses, blue light",
    cover: unsplash("1574258495973-f010dfbb5371", 800),
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Prescription", "Sunglasses", "Blue light", "Frames only"], filter: true },
      { key: "frame", label: "Frame", type: "select", options: ["Metal", "Acetate", "Plastic", "Rimless"], filter: true },
      { key: "fit", label: "Fit", type: "select", options: ["Unisex", "Men", "Women"], filter: true },
      brand(["Ray-Ban", "Oakley", "Gucci"]),
      { key: "case", label: "Case included", type: "boolean" },
    ],
  },
  {
    id: "jewellery",
    label: "Jewellery & watches",
    icon: "Gem",
    blurb: "Rings, bracelets, necklaces",
    cover: unsplash("1611591437281-460bfbe1220a", 800),
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Ring", "Bracelet", "Necklace", "Earrings", "Watch", "Anklet"], filter: true },
      { key: "material", label: "Material", type: "select", options: ["Gold-plated", "Sterling silver", "Stainless steel", "Beads", "Leather"], filter: true },
      { key: "size", label: "Size", type: "text", placeholder: "e.g. Ring size 7" },
      { key: "handmade", label: "Handmade", type: "boolean", filter: true },
    ],
  },
  {
    id: "fashion",
    label: "Fashion",
    icon: "Shirt",
    blurb: "Sneakers, clothing, bags",
    cover: unsplash("1542291026-7eec264c27ff", 800),
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Sneakers", "Shoes", "Clothing", "Bags", "Traditional wear"], filter: true },
      { key: "fit", label: "For", type: "select", options: ["Men", "Women", "Unisex"], filter: true },
      { key: "size", label: "Size", type: "text", placeholder: "e.g. EU 43, M" },
      brand(["Nike", "Adidas", "Puma", "Zara"]),
    ],
  },
  {
    id: "beauty",
    label: "Beauty",
    icon: "Droplets",
    blurb: "Perfume, skincare, makeup",
    cover: unsplash("1592945403244-b3fbafd7f539", 800),
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Perfume", "Skincare", "Makeup", "Hair"], filter: true },
      { key: "brand", label: "Brand", type: "text" },
      { key: "sealed", label: "Unopened", type: "boolean", filter: true },
      { key: "volume", label: "Size", type: "text", placeholder: "e.g. 100ml" },
    ],
  },
  {
    id: "food",
    label: "Food & snacks",
    icon: "UtensilsCrossed",
    blurb: "Homemade meals, bakes, snacks",
    cover: unsplash("1499636136210-6f4ee915583e", 800),
    noCondition: true,
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Homemade meal", "Baked goods", "Snacks", "Drinks"], filter: true },
      { key: "diet", label: "Dietary", type: "select", options: ["Contains meat", "Vegetarian", "Vegan"], filter: true },
      { key: "availability", label: "Available", type: "select", options: ["Today", "Pre-order", "Every day"], filter: true },
      { key: "portion", label: "Portion", type: "text", placeholder: "e.g. Serves 1, box of 6" },
      { key: "allergens", label: "Allergens", type: "text", placeholder: "e.g. Nuts, dairy" },
      { key: "spicy", label: "Spicy", type: "boolean" },
    ],
  },
  {
    id: "hostel",
    label: "Room & kitchen",
    icon: "BedDouble",
    blurb: "Fridges, bedding, furniture",
    cover: unsplash("1571175443880-49e1d25b2bc5", 800),
    attributes: [
      { key: "type", label: "Type", type: "select", options: ["Appliance", "Furniture", "Bedding", "Lighting", "Kitchen", "Decor"], filter: true },
      { key: "brand", label: "Brand", type: "text" },
      { key: "size", label: "Size", type: "text", placeholder: "e.g. 90 litres, single bed" },
    ],
  },
  {
    id: "other",
    label: "Everything else",
    icon: "Package",
    blurb: "Bikes, cameras, plants and more",
    cover: unsplash("1485965120184-e220f721d03e", 800),
    attributes: [{ key: "brand", label: "Brand", type: "text" }],
  },
];

export function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** A seller-created category gets a generic schema; sellers add their own details per listing. */
export function makeCustomCategory(label: string): CategoryDef {
  return {
    id: `c-${slugify(label)}`,
    label: label.trim(),
    icon: "Shapes",
    blurb: "Added by students",
    attributes: [{ key: "brand", label: "Brand", type: "text" }],
    custom: true,
  };
}

export const fallbackCategory = (id: string): CategoryDef => ({
  id,
  label: id.replace(/^c-/, "").replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
  icon: "Shapes",
  blurb: "",
  attributes: [],
});

export function findCategory(list: CategoryDef[], id: string) {
  return list.find((c) => c.id === id) ?? fallbackCategory(id);
}
