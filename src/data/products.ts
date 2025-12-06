// This file contains all product data
// Each category has multiple products (e.g., 42 rugs, multiple placemats, etc.)

import rugImage from "@/assets/product-rug.png";
import placematImage from "@/assets/product-placemat.png";
import runnerImage from "@/assets/product-runner.png";
import cushionImage from "@/assets/product-cushion.jpg";
import throwImage from "@/assets/product-throw.jpg";
import beddingImage from "@/assets/product-bedding.jpg";
import bathmatImage from "@/assets/product-bathmat.jpg";
import chairpadImage from "@/assets/product-chairpad.jpg";

// Product type definition
export interface Product {
  id: string; // Unique ID like "rug-001", "rug-002", etc.
  name: string; // Product name
  categoryId: string; // Which category it belongs to (rugs, placemats, etc.)
  image: string; // Main product image
  description: string; // Short description
  longDescription: string; // Detailed description for product detail page
  tags: string[]; // Searchable tags
  price?: string; // Optional price
}

// Category type definition
export interface Category {
  id: string;
  name: string;
  description: string;
}

// Helper function to generate multiple products for a category
// This is a template - you'll replace with your actual 42 rugs, etc.
function generateProducts(
  categoryId: string,
  categoryName: string,
  baseImage: string,
  count: number,
  baseName: string
): Product[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${categoryId}-${String(i + 1).padStart(3, '0')}`, // e.g., "rug-001", "rug-002"
    name: `${baseName} ${i + 1}`,
    categoryId,
    image: baseImage, // You'll replace this with actual different images
    description: `Premium ${categoryName.toLowerCase()} design ${i + 1}`,
    longDescription: `This is a beautiful ${categoryName.toLowerCase()} design ${i + 1}. Handcrafted with precision and care, using traditional techniques. Each piece is unique and adds warmth and character to any space.`,
    tags: [
      categoryName.toLowerCase(),
      "handwoven",
      "natural",
      `design-${i + 1}`,
      i % 2 === 0 ? "beige" : "neutral",
      i % 3 === 0 ? "modern" : "traditional"
    ],
  }));
}

// Generate products for each category
// TODO: Replace with your actual 42 rugs, actual placemats, etc.
const rugsProducts = generateProducts("rugs", "Rugs", rugImage, 42, "Handwoven Rug");
const placematsProducts = generateProducts("placemats", "Placemats", placematImage, 15, "Elegant Placemat");
const runnersProducts = generateProducts("runners", "Table Runners", runnerImage, 12, "Table Runner");
const cushionsProducts = generateProducts("cushions", "Cushions", cushionImage, 20, "Decorative Cushion");
const throwsProducts = generateProducts("throws", "Throws", throwImage, 10, "Cozy Throw");
const beddingProducts = generateProducts("bedding", "Premium Bedding", beddingImage, 8, "Bedding Set");
const bathmatsProducts = generateProducts("bathmats", "Bath Mats", bathmatImage, 6, "Spa Bath Mat");
const chairpadsProducts = generateProducts("chairpads", "Chair Pads", chairpadImage, 8, "Chair Pad");

// Combine all products
export const allProducts: Product[] = [
  ...rugsProducts,
  ...placematsProducts,
  ...runnersProducts,
  ...cushionsProducts,
  ...throwsProducts,
  ...beddingProducts,
  ...bathmatsProducts,
  ...chairpadsProducts,
];

// Get products by category
export function getProductsByCategory(categoryId: string): Product[] {
  return allProducts.filter(product => product.categoryId === categoryId);
}

// Get single product by ID
export function getProductById(productId: string): Product | undefined {
  return allProducts.find(product => product.id === productId);
}

// Category definitions
export const categories: Category[] = [
  { id: "rugs", name: "Rugs", description: "Handwoven rugs for every space" },
  { id: "placemats", name: "Placemats", description: "Elegant table settings for dining" },
  { id: "runners", name: "Table Runners", description: "Beautiful runners for your tables" },
  { id: "cushions", name: "Cushions", description: "Comfortable cushions" },
  { id: "throws", name: "Throws", description: "Soft throws and blankets" },
  { id: "bedding", name: "Premium Bedding", description: "Luxury bedding collections" },
  { id: "bathmats", name: "Bath Mats", description: "Spa-quality bath mats" },
  { id: "chairpads", name: "Chair Pads", description: "Comfortable seating solutions" },
];

// Get category by ID
export function getCategoryById(categoryId: string): Category | undefined {
  return categories.find(cat => cat.id === categoryId);
}
