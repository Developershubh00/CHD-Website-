import React, { useState, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
// Fallback images  
import rugImage from "@/assets/product-rug.png";
import cushionImage from "@/assets/product-cushion.jpg";
import lifestyleBathmat from "@/assets/lifestyle-bathmat.jpg";
import bathmatImage from "@/assets/product-bathmat.jpg";
import lifestyleChairpad from "@/assets/lifestyle-chairpad.jpg";
import chairpadImage from "@/assets/product-chairpad.jpg";

// Load ONLY data.json files (small - OK to eager load)
const dataModules = import.meta.glob('/src/assets/**/data.json', {
  eager: true,
  import: 'default'
}) as Record<string, {
  styleNumber?: string;
  description?: string;
  technique?: string;
  content?: string;
  size?: string;
  season?: string;
}>;

// Helper function to get data from JSON file
function getDataFromJson(category: string, slideNumber: number) {
  const slideNum = String(slideNumber).padStart(3, '0');
  const searchKey = `${category}/slide_${slideNum}/data.json`;
  
  for (const [key, value] of Object.entries(dataModules)) {
    if (key.includes(searchKey)) {
      return value;
    }
  }
  return null;
}

// Direct image URL from public folder - NO Vite processing, instant loading!
function getImageUrl(category: string, slideNumber: number, imageName: string): string {
  const slideNum = String(slideNumber).padStart(3, '0');
  const imageNameBase = imageName.replace(/\.(jpg|png)$/, '');
  
  // Return jpg path - img onError will fallback to png
  return `/images/${category}/slide_${slideNum}/${imageNameBase}.jpg`;
}

// Direct image URL from public folder for PNG files
function getImageUrlPng(category: string, slideNumber: number, imageName: string): string {
  const slideNum = String(slideNumber).padStart(3, '0');
  const imageNameBase = imageName.replace(/\.(jpg|png)$/, '');
  
  // Return png path directly
  return `/images/${category}/slide_${slideNum}/${imageNameBase}.png`;
}

// Get lifestyle image URL (tries jpg first, then png)
function getLifestyleImageUrl(category: string, slideNumber: number): string {
  const slideNum = String(slideNumber).padStart(3, '0');
  // Try jpg first, component will fallback to png if needed
  return `/images/${category}/slide_${slideNum}/lifestyle.jpg`;
}

// Get lifestyle image URL as PNG (for categories that use PNG)
function getLifestyleImageUrlPng(category: string, slideNumber: number): string {
  const slideNum = String(slideNumber).padStart(3, '0');
  return `/images/${category}/slide_${slideNum}/lifestyle.png`;
}

// Get table image URL (not used anymore, kept for reference)
function getTableImageUrl(category: string, slideNumber: number): string {
  const slideNum = String(slideNumber).padStart(3, '0');
  return `/images/${category}/slide_${slideNum}/table_01.png`;
}

// Build dynamic image array (excluding table images)
// Returns: [lifestyle, image_01, image_02] - missing images will be handled by onError handlers
function getProductImages(category: string, slideNumber: number, lifestylePng: boolean = false): string[] {
  const slideNum = String(slideNumber).padStart(3, '0');
  const images: string[] = [];
  
  // Add lifestyle image (some categories like TableRunner use PNG for lifestyle)
  if (lifestylePng) {
    images.push(`/images/${category}/slide_${slideNum}/lifestyle.png`);
  } else {
    images.push(`/images/${category}/slide_${slideNum}/lifestyle.jpg`); // Will fallback to png via onError
  }
  
  // Add image_01 and image_02 - always try jpg first (onError will fallback to png)
  images.push(`/images/${category}/slide_${slideNum}/image_01.jpg`);
  images.push(`/images/${category}/slide_${slideNum}/image_02.jpg`);
  
  // Note: table_01.png is excluded - not shown in thumbnails or detail page
  return images;
}

// Get 10 lifestyle images from different categories for rotation
function getRotatingLifestyleImages(baseSlideNum: number): string[] {
  // Mix lifestyle images from different categories to create variety
  // Using different slide numbers from various categories
  return [
    getLifestyleImageUrlPng('rugs', ((baseSlideNum + 1) % 195) + 1),
    getLifestyleImageUrlPng('placemat', ((baseSlideNum + 5) % 25) + 1),
    getLifestyleImageUrlPng('cushion', ((baseSlideNum + 10) % 556) + 1),
    getLifestyleImageUrlPng('throw', ((baseSlideNum + 15) % 147) + 1),
    getLifestyleImageUrlPng('bedding', ((baseSlideNum + 20) % 42) + 1),
    getLifestyleImageUrlPng('TableRunner', ((baseSlideNum + 25) % 19) + 1),
    getLifestyleImageUrlPng('rugs', ((baseSlideNum + 30) % 195) + 1),
    getLifestyleImageUrlPng('cushion', ((baseSlideNum + 35) % 556) + 1),
    getLifestyleImageUrlPng('placemat', ((baseSlideNum + 40) % 25) + 1),
    getLifestyleImageUrlPng('throw', ((baseSlideNum + 45) % 147) + 1),
  ];
}

// ============================================================================
// OLD PRODUCT DATA STRUCTURE - COMMENTED OUT BUT PRESERVED
// This had more detailed fields like longDescription, features, materials, 
// sizes, colors, rating, reviews that might be used later
// ============================================================================
/*
// Product data structure
const productData: Record<string, {
  id: string;
  name: string;
  brand: string;
  description: string;
  longDescription: string;
  images: string[];
  features: string[];
  materials: string[];
  sizes: Array<{ size: string; inStock: boolean; left?: number }>;
  colors: string[];
  rating: number;
  reviews: number;
}> = {
  rugs: {
    id: "rugs",
    name: "Handwoven Rugs",
    brand: "Creative Home Décor",
    description: "Premium quality handwoven rugs",
    longDescription: "Our handwoven rugs are crafted with precision and care, using traditional weaving techniques passed down through generations. Each piece is unique and adds warmth and character to any space.",
    images: [rugImage, rugImage, rugImage, rugImage],
    features: [
      "100% handwoven craftsmanship",
      "Durable and long-lasting",
      "Easy to clean and maintain",
      "Available in various sizes and patterns"
    ],
    materials: ["Cotton", "Jute", "Wool Blend"],
    sizes: [
      { size: "2x3 ft", inStock: true, left: 5 },
      { size: "3x5 ft", inStock: true, left: 3 },
      { size: "5x7 ft", inStock: true, left: 2 },
      { size: "8x10 ft", inStock: false }
    ],
    colors: ["Natural", "Beige", "Grey", "Blue", "Multicolor"],
    rating: 4.4,
    reviews: 156
  },
  placemats: {
    id: "placemats",
    name: "Elegant Placemats",
    brand: "Creative Home Décor",
    description: "Elegant table settings for dining",
    longDescription: "Transform your dining experience with our elegant placemats. Perfect for daily use or special occasions.",
    images: [placematImage, placematImage, placematImage, placematImage],
    features: [
      "Heat resistant",
      "Stain resistant finish",
      "Set of 4 or 6 available",
      "Machine washable"
    ],
    materials: ["Cotton", "Linen", "Cotton-Poly blend"],
    sizes: [
      { size: "13x18 inches", inStock: true, left: 10 },
      { size: "Round 15 inches", inStock: true, left: 8 }
    ],
    colors: ["White", "Cream", "Navy", "Sage Green", "Terracotta"],
    rating: 4.6,
    reviews: 89
  },
  runners: {
    id: "runners",
    name: "Table Runners",
    brand: "Creative Home Décor",
    description: "Beautiful runners for your tables",
    longDescription: "Add a touch of elegance to your dining table with our beautiful table runners.",
    images: [runnerImage, runnerImage, runnerImage, runnerImage],
    features: [
      "Premium quality fabric",
      "Versatile design",
      "Easy care",
      "Reversible options available"
    ],
    materials: ["Cotton", "Linen", "Jute"],
    sizes: [
      { size: "72 inches", inStock: true, left: 6 },
      { size: "90 inches", inStock: true, left: 4 },
      { size: "108 inches", inStock: true, left: 2 }
    ],
    colors: ["Natural", "White", "Grey", "Striped patterns"],
    rating: 4.5,
    reviews: 67
  },
  cushions: {
    id: "cushions",
    name: "Decorative Cushions",
    brand: "Creative Home Décor",
    description: "Comfortable cushions for your home",
    longDescription: "Our decorative cushions add comfort and style to any room.",
    images: [cushionImage, cushionImage, cushionImage, cushionImage],
    features: [
      "Soft and comfortable",
      "Removable covers",
      "Hidden zipper closure",
      "Premium filling"
    ],
    materials: ["Cotton", "Velvet", "Linen", "Cotton-Poly blend"],
    sizes: [
      { size: "12x12 inches", inStock: true, left: 15 },
      { size: "16x16 inches", inStock: true, left: 12 },
      { size: "18x18 inches", inStock: true, left: 8 },
      { size: "20x20 inches", inStock: true, left: 5 }
    ],
    colors: ["Wide range of colors available"],
    rating: 4.7,
    reviews: 234
  },
  throws: {
    id: "throws",
    name: "Cozy Throws",
    brand: "Creative Home Décor",
    description: "Soft throws and blankets",
    longDescription: "Wrap yourself in comfort with our cozy throws.",
    images: [throwImage, throwImage, throwImage, throwImage],
    features: [
      "Super soft texture",
      "Lightweight yet warm",
      "Machine washable",
      "Fade resistant"
    ],
    materials: ["Cotton", "Acrylic", "Cotton blend", "Fleece"],
    sizes: [
      { size: "50x60 inches", inStock: true, left: 7 },
      { size: "60x80 inches", inStock: true, left: 4 }
    ],
    colors: ["Solid colors", "Striped", "Patterned"],
    rating: 4.8,
    reviews: 189
  },
  bedding: {
    id: "bedding",
    name: "Premium Bedding",
    brand: "Creative Home Décor",
    description: "Luxury bedding collections",
    longDescription: "Experience luxury every night with our premium bedding collections.",
    images: [beddingImage, beddingImage, beddingImage, beddingImage],
    features: [
      "High thread count",
      "Breathable fabric",
      "Complete bedding sets",
      "Easy care instructions"
    ],
    materials: ["Cotton", "Egyptian Cotton", "Linen", "Cotton Sateen"],
    sizes: [
      { size: "Twin", inStock: true, left: 3 },
      { size: "Full", inStock: true, left: 5 },
      { size: "Queen", inStock: true, left: 8 },
      { size: "King", inStock: true, left: 4 }
    ],
    colors: ["White", "Ivory", "Grey", "Navy", "Various patterns"],
    rating: 4.9,
    reviews: 312
  },
  bathmats: {
    id: "bathmats",
    name: "Spa Bath Mats",
    brand: "Creative Home Décor",
    description: "Spa-quality bath mats",
    longDescription: "Bring spa-like luxury to your bathroom with our premium bath mats.",
    images: [bathmatImage, bathmatImage, bathmatImage, bathmatImage],
    features: [
      "Highly absorbent",
      "Quick-drying",
      "Non-slip backing",
      "Soft on feet"
    ],
    materials: ["Cotton", "Microfiber", "Memory foam"],
    sizes: [
      { size: "20x30 inches", inStock: true, left: 9 },
      { size: "24x36 inches", inStock: true, left: 6 }
    ],
    colors: ["White", "Grey", "Navy", "Spa Blue", "Beige"],
    rating: 4.6,
    reviews: 145
  },
  chairpads: {
    id: "chairpads",
    name: "Tote Bags",
    brand: "Creative Home Décor",
    description: "Durable everyday tote bags",
    longDescription: "Reusable, roomy totes designed for daily carry, errands, and travel.",
    images: [chairpadImage, chairpadImage, chairpadImage, chairpadImage],
    features: [
      "Durable handles",
      "Roomy interior",
      "Reusable & washable",
      "Everyday carry"
    ],
    materials: ["Cotton", "Canvas"],
    sizes: [
      { size: "Medium", inStock: true, left: 12 },
      { size: "Large", inStock: true, left: 8 }
    ],
    colors: ["Solid colors", "Patterned", "Seasonal designs"],
    rating: 4.5,
    reviews: 98
  }
};
*/
// ============================================================================
// END OF OLD PRODUCT DATA STRUCTURE
// ============================================================================

// Product type definition (matching Category.tsx)
type Product = {
  id: string;
  src: string; // Main/primary image (for category grid - shown in category page)
  images: string[]; // Array of 2 images for product detail page (auto-rotating carousel)
  title: string;
  tags: string[];
  // Product specifications from data.json
  styleNumber?: string; // e.g., "CHD-RG-1120"
  productDescription?: string; // e.g., "RUG", "CUSHION" (from data.json description field)
  technique?: string; // e.g., "WOVEN"
  content?: string; // e.g., "COTTON + JUTE"
  size?: string; // e.g., "24X36\""
  season?: string; // e.g., "EVERYDAY"
};

// Category data structure (same as Category.tsx)
const categoryData: Record<string, { 
  name: string; 
  products: Product[];
}> = {
  rugs: {
    name: "Rugs",
    products: Array.from({ length: 195 }, (_, i) => {
      const slideNum = i + 1;
      // Load data from JSON file (manually curated)
      const data = getDataFromJson('rugs', slideNum) || {};
      
      return {
        id: `rug-${slideNum}`,
        src: getLifestyleImageUrl('rugs', slideNum),
        images: getProductImages('rugs', slideNum),
        title: data.styleNumber || `CHD-RG-${String(slideNum).padStart(4, '0')}`,
        tags: ["handwoven", "natural", i % 3 === 0 ? "living room" : i % 3 === 1 ? "bedroom" : "dining"],
        // Product specifications from data.json
        styleNumber: data.styleNumber || `CHD-RG-${String(slideNum).padStart(4, '0')}`,
        productDescription: data.description,
        technique: data.technique,
        content: data.content,
        size: data.size,
        season: data.season,
      };
    }),
  },
  placemats: {
    name: "Placemats",
    products: Array.from({ length: 25 }, (_, i) => {
      const slideNum = i + 1;
      const data = getDataFromJson('placemat', slideNum) || {};
      
      return {
        id: `placemat-${slideNum}`,
        src: getLifestyleImageUrl('placemat', slideNum),
        images: getProductImages('placemat', slideNum),
        title: data.styleNumber || `CHD-PM-${String(slideNum).padStart(4, '0')}`,
        tags: ["dining", "elegant", i % 2 === 0 ? "set" : "individual"],
        styleNumber: data.styleNumber || `CHD-PM-${String(slideNum).padStart(4, '0')}`,
        productDescription: data.description,
        technique: data.technique,
        content: data.content,
        size: data.size,
        season: data.season,
      };
    }),
  },
  runners: {
    name: "Table Runners",
    products: Array.from({ length: 19 }, (_, i) => {
      const slideNum = i + 1;
      const data = getDataFromJson('TableRunner', slideNum) || {};
      
      return {
        id: `runner-${slideNum}`,
        // Lifestyle first, then product images, then table
        src: getImageUrlPng('TableRunner', slideNum, 'lifestyle.png'),
        images: getProductImages('TableRunner', slideNum, true), // Use PNG for TableRunner
        title: data.styleNumber || `CHD-TR-${String(slideNum).padStart(4, '0')}`,
        tags: ["dining", "elegant", "table decor"],
        styleNumber: data.styleNumber || `CHD-TR-${String(slideNum).padStart(4, '0')}`,
        productDescription: data.description,
        technique: data.technique,
        content: data.content,
        size: data.size,
        season: data.season,
      };
    }),
  },
  cushions: {
    name: "Cushions",
    products: Array.from({ length: 556 }, (_, i) => {
      const slideNum = i + 1;
      const data = getDataFromJson('cushion', slideNum) || {};
      
      return {
        id: `cushion-${slideNum}`,
        src: getLifestyleImageUrl('cushion', slideNum),
        images: getProductImages('cushion', slideNum),
        title: data.styleNumber || `CHD-CU-${String(slideNum).padStart(4, '0')}`,
        tags: ["decorative", "comfort", "living room"],
        styleNumber: data.styleNumber || `CHD-CU-${String(slideNum).padStart(4, '0')}`,
        productDescription: data.description,
        technique: data.technique,
        content: data.content,
        size: data.size,
        season: data.season,
      };
    }),
  },
  throws: {
    name: "Throws",
    products: Array.from({ length: 147 }, (_, i) => {
      const slideNum = i + 1;
      const data = getDataFromJson('throw', slideNum) || {};
      
      return {
        id: `throw-${slideNum}`,
        src: getLifestyleImageUrl('throw', slideNum),
        images: getProductImages('throw', slideNum, true), // Use PNG for throw
        title: data.styleNumber || `CHD-TH-${String(slideNum).padStart(4, '0')}`,
        tags: ["soft", "cozy", "blanket"],
        styleNumber: data.styleNumber || `CHD-TH-${String(slideNum).padStart(4, '0')}`,
        productDescription: data.description,
        technique: data.technique,
        content: data.content,
        size: data.size,
        season: data.season,
      };
    }),
  },
  bedding: {
    name: "Premium Bedding",
    products: Array.from({ length: 39 }, (_, i) => {
      const slideNum = i + 1;
      const data = getDataFromJson('bedding', slideNum) || {};
      
      return {
        id: `bedding-${slideNum}`,
        src: getLifestyleImageUrl('bedding', slideNum),
        images: getProductImages('bedding', slideNum),
        title: data.styleNumber || `CHD-BD-${String(slideNum).padStart(4, '0')}`,
        tags: ["luxury", "bedroom", "comfortable"],
        styleNumber: data.styleNumber || `CHD-BD-${String(slideNum).padStart(4, '0')}`,
        productDescription: data.description,
        technique: data.technique,
        content: data.content,
        size: data.size,
        season: data.season,
      };
    }),
  }, 
  bathmats: {
    name: "Bath Mats",
    products: Array.from({ length: 149 }, (_, i) => {
      const slideNum = i + 1;
      const data = getDataFromJson('bathmat', slideNum) || {};
      
      return {
        id: `bathmat-${slideNum}`,
        src: getLifestyleImageUrlPng('bathmat', slideNum),
        images: getProductImages('bathmat', slideNum, true), // Use PNG for bathmat
        title: data.styleNumber || `CHD-BM-${String(slideNum).padStart(4, '0')}`,
        tags: ["spa", "bathroom", "absorbent"],
        styleNumber: data.styleNumber || `CHD-BM-${String(slideNum).padStart(4, '0')}`,
        productDescription: data.description,
        technique: data.technique,
        content: data.content,
        size: data.size,
        season: data.season,
      };
    }),
  },
  chairpads: {
    name: "Tote Bags",
    products: Array.from({ length: 46 }, (_, i) => {
      const slideNum = i + 1;
      const data = getDataFromJson('totebag', slideNum) || {};
      
      return {
        id: `chairpad-${slideNum}`,
        src: getLifestyleImageUrlPng('totebag', slideNum),
        images: getProductImages('totebag', slideNum), // Use JPG for totebag
        title: data.styleNumber || `CHD-TB-${String(slideNum).padStart(4, '0')}`,
        tags: ["tote", "carry", "bag"],
        styleNumber: data.styleNumber || `CHD-TB-${String(slideNum).padStart(4, '0')}`,
        productDescription: data.description,
        technique: data.technique,
        content: data.content,
        size: data.size,
        season: data.season,
      };
    }),
  },
};

export default function ProductDetail() {
  const { categoryId, productId } = useParams<{ categoryId: string; productId: string }>();
  const navigate = useNavigate();
  const [showContactForm, setShowContactForm] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0); // Currently displayed image index
  
  // Magnifying glass state
  const [magnifyActive, setMagnifyActive] = useState(false);
  const [magnifyPosition, setMagnifyPosition] = useState({ x: 0, y: 0 });
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isDesktop, setIsDesktop] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);
  
  // Track actual loaded image URLs (after fallback from jpg to png)
  const [loadedImageUrls, setLoadedImageUrls] = useState<Record<number, string>>({});
  
  // Track which image indices failed to load (both jpg and png failed)
  const [failedImageIndices, setFailedImageIndices] = useState<Set<number>>(new Set());

  // Check if desktop on mount and window resize
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);
  
  // Contact form state (matching ContactSection)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null);

  // Get category and product data
  const category = categoryId ? categoryData[categoryId] : null;
  const product = category && productId 
    ? category.products.find(p => p.id === productId) 
    : null;

  // Scroll to top and reset state when product changes
  useEffect(() => {
    window.scrollTo(0, 0);
    setSelectedImageIndex(0);
    setFailedImageIndices(new Set());
    setLoadedImageUrls({});
  }, [productId]);

  // Auto-switch to next valid image if current one fails
  useEffect(() => {
    if (product && failedImageIndices.has(selectedImageIndex)) {
      // Find next valid image
      for (let i = 0; i < product.images.length; i++) {
        if (!failedImageIndices.has(i)) {
          setSelectedImageIndex(i);
          break;
        }
      }
    }
  }, [failedImageIndices, selectedImageIndex, product]);

  // Handle manual image selection
  const handleImageSelect = (index: number) => {
    setSelectedImageIndex(index);
    setMagnifyActive(false); // Reset magnify when image changes
  };

  // Magnifying glass handlers
  const handleMouseEnter = () => {
    setMagnifyActive(true);
  };

  const handleMouseLeave = () => {
    setMagnifyActive(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageContainerRef.current) return;
    
    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate percentage position (0-100)
    const percentX = (x / rect.width) * 100;
    const percentY = (y / rect.height) * 100;
    
    // Clamp values between 0 and 100
    const clampedX = Math.max(0, Math.min(100, percentX));
    const clampedY = Math.max(0, Math.min(100, percentY));
    
    setMousePosition({ x, y });
    setMagnifyPosition({ x: clampedX, y: clampedY });
  };

  const handlePrevImage = () => {
    if (!product?.images?.length) return;
    setSelectedImageIndex((prev) => {
      let newIndex = (prev - 1 + product.images.length) % product.images.length;
      // Skip failed images
      while (failedImageIndices.has(newIndex) && newIndex !== prev) {
        newIndex = (newIndex - 1 + product.images.length) % product.images.length;
      }
      return newIndex;
    });
  };

  const handleNextImage = () => {
    if (!product?.images?.length) return;
    setSelectedImageIndex((prev) => {
      let newIndex = (prev + 1) % product.images.length;
      // Skip failed images
      while (failedImageIndices.has(newIndex) && newIndex !== prev) {
        newIndex = (newIndex + 1) % product.images.length;
      }
      return newIndex;
    });
  };

  if (!category || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-light mb-4">Product not found</h2>
          <Link to="/products" className="text-accent hover:underline">
            Return to products
          </Link>
        </div>
      </div>
    );
  }

  const handleBack = () => {
    navigate(`/category/${categoryId}`);
  };

  // Contact form handlers (matching ContactSection)
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      // Replace with your Google Apps Script Web App URL
      const SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
      
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...formData, product: product?.title })
      });

      // Since we're using no-cors, we can't read the response
      // Assume success if no error is thrown
      setSubmitStatus('success');
      setFormData({
        name: "",
        email: "",
        phone: "",
        company: "",
        message: ""
      });
      
      setTimeout(() => {
        setShowContactForm(false);
        setSubmitStatus(null);
      }, 2000);
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Back Button - Top Right - Static on mobile, fixed on desktop */}
      <div className="absolute md:fixed top-4 right-4 md:top-6 md:right-6 z-[60]">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-3 py-2 md:px-4 md:py-2.5 bg-background/95 backdrop-blur-md border border-border rounded-3xl hover:bg-accent/10 transition-colors shadow-lg"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
          <span className="text-sm md:text-base font-medium">Back</span>
        </button>
      </div>

      {/* Main Content - Mobile optimized with proper spacing */}
      <div className="flex-1 w-full pt-4 md:pt-6 pb-6 md:pb-6 overflow-y-auto relative">
        <div className="max-w-7xl mx-auto w-full px-4 md:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6 md:gap-8 lg:gap-12 lg:items-start">
            {/* Left Side - Product Image Gallery - Mobile optimized */}
            <div className="flex flex-col space-y-3 md:space-y-4 lg:space-y-4 pt-12 md:pt-6 lg:pt-8 relative">
              {/* Main Image Container */}
              <div className="relative w-full aspect-square md:aspect-square lg:aspect-[4/5] lg:max-h-[70vh]">
                <div 
                  ref={imageContainerRef}
                  className="relative w-full h-full rounded-xl md:rounded-2xl overflow-hidden border-2 border-border bg-card shadow-lg group cursor-zoom-in"
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                  onMouseMove={handleMouseMove}
                >
                  {/* Static background image to prevent white space */}
                  <img
                    src={product.images[selectedImageIndex]}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-contain absolute inset-0 bg-background"
                    aria-hidden="true"
                    onLoad={(e) => {
                      // Store the actual loaded URL for zoom panel
                      const target = e.target as HTMLImageElement;
                      setLoadedImageUrls(prev => ({ ...prev, [selectedImageIndex]: target.src }));
                    }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (target.src.endsWith('.jpg')) {
                        target.src = target.src.replace('.jpg', '.png');
                      } else {
                        // Both jpg and png failed - mark as failed
                        setFailedImageIndices(prev => new Set([...prev, selectedImageIndex]));
                      }
                    }}
                  />
                  
                  <AnimatePresence mode="sync" initial={false}>
                    <motion.img
                      key={selectedImageIndex}
                      src={product.images[selectedImageIndex]}
                      alt={`${product.title} - View ${selectedImageIndex + 1}`}
                      className="w-full h-full object-contain absolute inset-0 bg-background"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ 
                        duration: 0.5, 
                        ease: "easeInOut"
                      }}
                      onLoad={(e) => {
                        // Store the actual loaded URL for zoom panel
                        const target = e.target as HTMLImageElement;
                        setLoadedImageUrls(prev => ({ ...prev, [selectedImageIndex]: target.src }));
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src.endsWith('.jpg')) {
                          target.src = target.src.replace('.jpg', '.png');
                        } else {
                          // Both jpg and png failed - mark as failed and switch to next valid image
                          setFailedImageIndices(prev => new Set([...prev, selectedImageIndex]));
                        }
                      }}
                    />
                  </AnimatePresence>

                  {/* Magnifying Glass Lens Indicator - Only on desktop */}
                  {magnifyActive && isDesktop && (
                    <div
                      className="absolute w-24 h-24 rounded-full border-2 border-accent/70 pointer-events-none z-20"
                      style={{
                        left: `${mousePosition.x}px`,
                        top: `${mousePosition.y}px`,
                        transform: 'translate(-50%, -50%)',
                        boxShadow: '0 0 0 2px rgba(255,255,255,0.3), 0 4px 12px rgba(0,0,0,0.3)',
                      }}
                    />
                  )}


                  {/* Image Counter Indicator */}
                  <div className="absolute top-3 right-3 md:top-4 md:right-4 bg-background/80 backdrop-blur-sm px-2 py-1 md:px-3 md:py-1.5 rounded-full text-xs font-medium border border-border z-10">
                    {selectedImageIndex + 1} / {product.images.length - failedImageIndices.size}
                  </div>

              {/* Gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-0" />
                </div>

                {/* Manual navigation arrows (outside the clipped area) */}
                {product.images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevImage}
                      className="absolute z-20 -left-3 md:-left-6 top-1/2 -translate-y-1/2 p-1 md:p-2 rounded-full bg-background/90 border border-border shadow-lg hover:bg-accent/10 transition-colors"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="w-6 h-6 md:w-7 md:h-7" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextImage}
                      className="absolute z-20 -right-3 md:-right-6 top-1/2 -translate-y-1/2 p-1 md:p-2 rounded-full bg-background/90 border border-border shadow-lg hover:bg-accent/10 transition-colors"
                      aria-label="Next image"
                    >
                      <ChevronRight className="w-6 h-6 md:w-7 md:h-7" />
                    </button>
                  </>
                )}
            </div>

            {/* Thumbnail Navigation - Modern Premium Design */}
            <div className="flex gap-2 md:gap-3 justify-center flex-shrink-0">
              {product.images.map((image, index) => {
                // Skip rendering thumbnails for images that failed to load
                if (failedImageIndices.has(index)) return null;
                
                return (
                  <button
                    key={index}
                    onClick={() => handleImageSelect(index)}
                    className={`relative flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-xl overflow-hidden border-2 transition-all duration-300 group ${
                      selectedImageIndex === index
                        ? "border-accent shadow-lg shadow-accent/20 scale-105"
                        : "border-border hover:border-accent/50 hover:scale-105"
                    }`}
                    aria-label={`View image ${index + 1}`}
                  >
                    <img
                      src={image}
                      alt={`${product.title} thumbnail ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        if (target.src.endsWith('.jpg')) {
                          // Try PNG fallback
                          target.src = target.src.replace('.jpg', '.png');
                        } else {
                          // Both jpg and png failed - mark as failed and hide
                          setFailedImageIndices(prev => new Set([...prev, index]));
                        }
                      }}
                    />
                    
                    {/* Active indicator overlay */}
                    {selectedImageIndex === index && (
                      <div className="absolute inset-0 bg-accent/10 border-2 border-accent rounded-xl" />
                    )}
                    
                    {/* Hover effect */}
                    <div className="absolute inset-0 bg-background/0 group-hover:bg-background/10 transition-colors duration-300 rounded-xl" />
                  </button>
                );
              })}
            </div>
            </div>

          {/* Right Side - Product Information - Compact layout */}
          <div className="flex flex-col space-y-3 md:space-y-4 pt-12 md:pt-6 lg:pt-8">
            {/* Product Specifications Table */}
            {(product.styleNumber || product.productDescription || product.technique || product.content || product.size || product.season) && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="divide-y divide-border">
                  {product.styleNumber && (
                    <div className="grid grid-cols-2">
                      <div className="bg-background px-3 md:px-4 py-2 md:py-2.5 border-r border-border">
                        <span className="text-xs md:text-sm font-medium text-foreground">STYLE #</span>
                      </div>
                      <div className="bg-muted/50 px-3 md:px-4 py-2 md:py-2.5">
                        <span className="text-xs md:text-sm text-foreground">{product.styleNumber}</span>
                      </div>
                    </div>
                  )}
                  {product.productDescription && (
                    <div className="grid grid-cols-2">
                      <div className="bg-background px-3 md:px-4 py-2 md:py-2.5 border-r border-border">
                        <span className="text-xs md:text-sm font-medium text-foreground">DESCRIPTION</span>
                      </div>
                      <div className="bg-muted/50 px-3 md:px-4 py-2 md:py-2.5">
                        <span className="text-xs md:text-sm text-foreground">{product.productDescription}</span>
                      </div>
                    </div>
                  )}
                  {product.technique && (
                    <div className="grid grid-cols-2">
                      <div className="bg-background px-3 md:px-4 py-2 md:py-2.5 border-r border-border">
                        <span className="text-xs md:text-sm font-medium text-foreground">TECHNIQUE</span>
                      </div>
                      <div className="bg-muted/50 px-3 md:px-4 py-2 md:py-2.5">
                        <span className="text-xs md:text-sm text-foreground">{product.technique}</span>
                      </div>
                    </div>
                  )}
                  {product.content && (
                    <div className="grid grid-cols-2">
                      <div className="bg-background px-3 md:px-4 py-2 md:py-2.5 border-r border-border">
                        <span className="text-xs md:text-sm font-medium text-foreground">CONTENT</span>
                      </div>
                      <div className="bg-muted/50 px-3 md:px-4 py-2 md:py-2.5">
                        <span className="text-xs md:text-sm text-foreground">{product.content}</span>
                      </div>
                    </div>
                  )}
                  {product.size && (
                    <div className="grid grid-cols-2">
                      <div className="bg-background px-3 md:px-4 py-2 md:py-2.5 border-r border-border">
                        <span className="text-xs md:text-sm font-medium text-foreground">SIZE</span>
                      </div>
                      <div className="bg-muted/50 px-3 md:px-4 py-2 md:py-2.5">
                        <span className="text-xs md:text-sm text-foreground">{product.size}</span>
                      </div>
                    </div>
                  )}
                  {product.season && (
                    <div className="grid grid-cols-2">
                      <div className="bg-background px-3 md:px-4 py-2 md:py-2.5 border-r border-border">
                        <span className="text-xs md:text-sm font-medium text-foreground">SEASON</span>
                      </div>
                      <div className="bg-muted/50 px-3 md:px-4 py-2 md:py-2.5">
                        <span className="text-xs md:text-sm text-foreground">{product.season}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Materials - COMMENTED OUT, CAN BE ENABLED LATER */}
            {/* 
            <div>
              <h3 className="text-sm font-medium mb-3">Available Materials</h3>
              <div className="flex flex-wrap gap-2">
                {product.materials.map((material, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-muted rounded-md text-sm"
                  >
                    {material}
                  </span>
                ))}
              </div>
            </div>
            */}

            {/* Size Selection - COMMENTED OUT, CAN BE ENABLED LATER */}
            {/* 
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium">Select Size</h3>
                <button className="text-sm text-accent hover:underline">
                  Size guide →
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {product.sizes.map((sizeOption, index) => (
                  <button
                    key={index}
                    onClick={() => sizeOption.inStock && setSelectedSize(sizeOption.size)}
                    disabled={!sizeOption.inStock}
                    className={`relative p-3 border-2 rounded-lg text-sm transition-all ${
                      selectedSize === sizeOption.size
                        ? "border-accent bg-accent/5"
                        : sizeOption.inStock
                        ? "border-border hover:border-accent"
                        : "border-border opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div className="font-medium">{sizeOption.size}</div>
                    {sizeOption.inStock && sizeOption.left && sizeOption.left <= 5 && (
                      <div className="text-xs text-red-500 mt-1">
                        {sizeOption.left} left
                      </div>
                    )}
                    {!sizeOption.inStock && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Out of stock
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {!selectedSize && (
                <p className="text-xs text-muted-foreground mt-2">
                  Size not available? <button className="text-accent hover:underline">Notify me</button>
                </p>
              )}
            </div>
            */}

            {/* Quality Badge - Compact */}
            <div className="flex items-center gap-2 p-2.5 md:p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 text-xs md:text-sm text-green-700 dark:text-green-300">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Best Quality Guaranteed</span>
              </div>
            </div>

            {/* Contact Button - Compact */}
            <div className="space-y-1.5 md:space-y-2">
              <motion.button
                onClick={() => setShowContactForm(true)}
                className="group relative w-full px-5 md:px-8 py-3 md:py-4 bg-slate-800 text-white rounded-full overflow-hidden hover:bg-slate-700 transition-all duration-300 flex items-center justify-center gap-2 font-medium text-sm md:text-base lg:text-lg shadow-lg"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="relative z-10 flex items-center gap-2">
                  CONTACT US
                  <Send className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform" />
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.button>

              <p className="text-center text-xs md:text-sm text-muted-foreground px-2">
                Bulk orders & custom requirements welcome
              </p>
            </div>

            {/* Features List - COMMENTED OUT, CAN BE ENABLED LATER */}
            {/* 
            <div className="border-t border-border pt-6 space-y-3">
              <h3 className="text-sm font-medium mb-3">Key Features</h3>
              {product.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-accent mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm text-foreground">{feature}</span>
                </div>
              ))}
            </div>
            */}
          </div>
          </div>
        </div>

        {/* Additional Trust Signals - COMMENTED OUT, CAN BE ENABLED LATER */}
        {/* 
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium mb-1">Quality Assured</h3>
              <p className="text-sm text-muted-foreground">
                Handcrafted with premium materials from Panipat, India
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium mb-1">Custom Orders</h3>
              <p className="text-sm text-muted-foreground">
                Tailored to your specifications and requirements
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-medium mb-1">Direct Support</h3>
              <p className="text-sm text-muted-foreground">
                We're here to help with your order and inquiries
              </p>
            </div>
          </div>
        </div>
        */}

        {/* Breadcrumb - COMMENTED OUT, CAN BE ENABLED LATER */}
        {/* 
        <div className="border-b border-border">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link to="/" className="hover:text-foreground">Home</Link>
              <ChevronRight className="w-4 h-4" />
              <Link to="/products" className="hover:text-foreground">Products</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-foreground">{product.name}</span>
            </div>
          </div>
        </div>
        */}
      </div>

      {/* Contact Form Modal - Popup on all screen sizes */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-card rounded-2xl p-5 md:p-6 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl md:text-2xl font-light text-slate-900 dark:text-foreground">Get in Touch</h3>
              <button
                onClick={() => {
                  setShowContactForm(false);
                  setSubmitStatus(null);
                  setFormData({ name: "", email: "", phone: "", company: "", message: "" });
                }}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-foreground text-2xl transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-foreground mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  required
                  className="w-full px-4 py-2.5 text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-foreground mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFormChange}
                  required
                  className="w-full px-4 py-2.5 text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-foreground mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleFormChange}
                  className="w-full px-4 py-2.5 text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-foreground mb-1">
                  Company
                </label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleFormChange}
                  className="w-full px-4 py-2.5 text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-foreground mb-1">
                  Message *
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleFormChange}
                  required
                  rows={3}
                  className="w-full px-4 py-2.5 text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none resize-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              {submitStatus === 'success' && (
                <div className="p-3 text-sm bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 rounded-lg">
                  Thank you! We'll get back to you soon.
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="p-3 text-sm bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300 rounded-lg">
                  Something went wrong. Please try again.
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-slate-900 dark:bg-slate-800 text-white py-3 text-base font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Zoom Panel - Fixed position overlay */}
      {magnifyActive && isDesktop && imageContainerRef.current && (
        <div 
          className="fixed pointer-events-none rounded-2xl overflow-hidden border-2 border-border shadow-2xl"
          style={{
            top: imageContainerRef.current.getBoundingClientRect().top,
            left: imageContainerRef.current.getBoundingClientRect().right + 24,
            width: imageContainerRef.current.getBoundingClientRect().width,
            height: imageContainerRef.current.getBoundingClientRect().height,
            // Use the actual loaded URL (which may have been changed from .jpg to .png via onError)
            backgroundImage: `url(${loadedImageUrls[selectedImageIndex] || product.images[selectedImageIndex]})`,
            backgroundColor: 'hsl(var(--card))',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '300%',
            backgroundPosition: `${magnifyPosition.x}% ${magnifyPosition.y}%`,
            zIndex: 9999,
          }}
        />
      )}
    </div>
  );
}
