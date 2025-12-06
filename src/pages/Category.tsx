import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import rugImage from "@/assets/product-rug.png";
import placematImage from "@/assets/product-placemat.png";
import runnerImage from "@/assets/product-runner.png";
import cushionImage from "@/assets/product-cushion.jpg";
import throwImage from "@/assets/product-throw.jpg";
import beddingImage from "@/assets/product-bedding.jpg";
import bathmatImage from "@/assets/product-bathmat.jpg";
import chairpadImage from "@/assets/product-chairpad.jpg";
import lifestyleRug from "@/assets/lifestyle-rug.jpg";
import lifestyleRunner from "@/assets/lifestyle-runner.jpg";
import lifestylePlacemat from "@/assets/lifestyle-placemat.jpg";
import lifestyleBedding from "@/assets/lifestyle-bedding.jpg";
import lifestyleBathmat from "@/assets/lifestyle-bathmat.jpg";
import lifestyleChairpad from "@/assets/lifestyle-chairpad.jpg";

// Pre-load all product images using Vite's import.meta.glob
// Using eager: true to pre-load all images synchronously
// Match both jpg and png files
const imageModulesJpg = import.meta.glob('/src/assets/**/image_*.jpg', { 
  eager: true,
  import: 'default'
}) as Record<string, string>;

const imageModulesPng = import.meta.glob('/src/assets/**/image_*.png', { 
  eager: true,
  import: 'default'
}) as Record<string, string>;

// Combine both modules
const allImageModules = { ...imageModulesJpg, ...imageModulesPng };

// Pre-load all specs.json files (fast JSON loading - no OCR in production!)
const specsModules = import.meta.glob('/src/assets/**/specs.json', {
  eager: true,
  import: 'default'
}) as Record<string, {
  styleNumber?: string;
  technique?: string;
  content?: string;
  size?: string;
  season?: string;
  theme?: string;
  country?: string;
}>;

// Helper function to get specs from JSON file
function getSpecsFromJson(category: string, slideNumber: number) {
  const slideNum = String(slideNumber).padStart(3, '0');
  
  // Try different path variations
  const pathVariations = [
    `/src/assets/${category}/slide_${slideNum}/specs.json`,
    `./src/assets/${category}/slide_${slideNum}/specs.json`,
    `src/assets/${category}/slide_${slideNum}/specs.json`,
  ];
  
  // Try to find the specs file
  for (const path of pathVariations) {
    if (specsModules[path]) {
      return specsModules[path];
    }
  }
  
  // Also try partial match
  const searchKey = `slide_${slideNum}/specs.json`;
  for (const [key, value] of Object.entries(specsModules)) {
    if (key.includes(searchKey)) {
      return value;
    }
  }
  
  return null;
}

// Helper function to get image URL dynamically
function getImageUrl(category: string, slideNumber: number, imageName: string): string {
  const slideNum = String(slideNumber).padStart(3, '0');
  
  // Try both .jpg and .png extensions
  const imageNameBase = imageName.replace(/\.(jpg|png)$/, '');
  
  // Vite's glob might use different path formats, try multiple variations
  const pathVariations = [
    `/src/assets/${category}/slide_${slideNum}/${imageNameBase}.jpg`,
    `/src/assets/${category}/slide_${slideNum}/${imageNameBase}.png`,
    `./src/assets/${category}/slide_${slideNum}/${imageNameBase}.jpg`,
    `./src/assets/${category}/slide_${slideNum}/${imageNameBase}.png`,
    `src/assets/${category}/slide_${slideNum}/${imageNameBase}.jpg`,
    `src/assets/${category}/slide_${slideNum}/${imageNameBase}.png`,
  ];
  
  // Try to find the image in the pre-loaded modules
  for (const path of pathVariations) {
    if (allImageModules[path]) {
      return allImageModules[path] as string;
    }
  }
  
  // Also try to find by partial match (in case path format is different)
  const searchKey = `slide_${slideNum}/${imageNameBase}`;
  for (const [key, value] of Object.entries(allImageModules)) {
    if (key.includes(searchKey)) {
      return value as string;
    }
  }
  
  // Fallback to placeholder images
  const fallbacks: Record<string, string> = {
    'rugs': rugImage,
    'placemat': placematImage,
    'placemats': placematImage,
    'runners': runnerImage,
    'TableRunner': runnerImage,
    'cushion': cushionImage,
    'cushions': cushionImage,
    'throw': throwImage,
    'throws': throwImage,
    'bedding': beddingImage,
    'bathmats': bathmatImage,
    'chairpads': chairpadImage,
  };
  
  return fallbacks[category] || rugImage;
}

// ============================================================================
// OLD DATA STRUCTURE - COMMENTED OUT BUT PRESERVED
// This was the original structure that used "images" array instead of "products"
// ============================================================================
/*
const categoryData: Record<string, { name: string; images: Array<{ src: string; title: string; tags: string[] }> }> = {
  rugs: {
    name: "Rugs",
    images: [
      { src: lifestyleRug, title: "Handwoven Rug in Living Space", tags: ["handwoven", "living room", "natural"] },
      { src: rugImage, title: "Handwoven Rug - Product View", tags: ["handwoven", "beige", "neutral"] },
    ],
  },
  placemats: {
    name: "Placemats",
    images: [
      { src: lifestylePlacemat, title: "Placemats - Morning Scene", tags: ["dining", "breakfast", "natural"] },
      { src: placematImage, title: "Placemat Set", tags: ["set", "beige", "dining"] },
    ],
  },
  runners: {
    name: "Table Runners",
    images: [
      { src: lifestyleRunner, title: "Elegant Table Runner Setting", tags: ["elegant", "dining", "centerpiece"] },
      { src: runnerImage, title: "Table Runner - Product View", tags: ["beige", "dining", "table"] },
    ],
  },
  cushions: {
    name: "Cushions",
    images: [
      { src: cushionImage, title: "Embroidered Cushion Collection", tags: ["embroidered", "decorative", "comfort", "living room"] },
    ],
  },
  throws: {
    name: "Throws",
    images: [
      { src: throwImage, title: "Throw Collection", tags: ["soft", "cozy", "blanket"] },
    ],
  },
  bedding: {
    name: "Premium Bedding",
    images: [
      { src: lifestyleBedding, title: "Luxurious Bedding Collection", tags: ["luxury", "bedroom", "comfortable"] },
      { src: beddingImage, title: "Premium Bedding Set", tags: ["premium", "bedding", "set"] },
    ],
  }, 
  bathmats: {
    name: "Bath Mats",
    images: [
      { src: lifestyleBathmat, title: "Spa Bath Mat Experience", tags: ["spa", "bathroom", "absorbent"] },
      { src: bathmatImage, title: "Bath Mat", tags: ["bathroom", "soft", "bath"] },
    ],
  },
  chairpads: {
    name: "Chair Pads",
    images: [
      { src: lifestyleChairpad, title: "Dining Chair Pads in Context", tags: ["dining", "comfortable", "cushion", "chair"] },
      { src: chairpadImage, title: "Chair Pad Collection", tags: ["chair", "pad", "comfort", "dining"] },
    ],
  },
};
*/
// ============================================================================
// END OF OLD DATA STRUCTURE
// ============================================================================

// Product type definition (matching ProductDetail.tsx)
type Product = {
  id: string;
  src: string; // Main/primary image (for category grid)
  images?: string[]; // Array of 2 images for product detail page (optional for category page)
  title: string;
  description: string;
  tags: string[];
  // Product specifications
  styleNumber?: string; // e.g., "CHD-RG-1120"
  technique?: string; // e.g., "WOVEN"
  content?: string; // e.g., "COTTON + JUTE"
  size?: string; // e.g., "24X36\""
  season?: string; // e.g., "EVERYDAY"
  theme?: string; // Optional
  country?: string; // Optional
};

// Category data structure - each category has multiple products
const categoryData: Record<string, { 
  name: string; 
  products: Product[];
}> = {
  rugs: {
    name: "Rugs",
    products: Array.from({ length: 195 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getSpecsFromJson('rugs', slideNum) || {};
      
      return {
        id: `rug-${slideNum}`,
        src: getImageUrl('rugs', slideNum, 'image_01.jpg'),
        images: [
          getImageUrl('rugs', slideNum, 'image_01.jpg'),
          getImageUrl('rugs', slideNum, 'image_02.jpg'),
        ],
        title: `Handwoven Rug Type ${slideNum}`,
        description: `Premium quality handwoven rug with unique design pattern ${slideNum}. Crafted with precision and care using traditional weaving techniques.`,
        tags: ["handwoven", "natural", i % 3 === 0 ? "living room" : i % 3 === 1 ? "bedroom" : "dining"],
        styleNumber: specs.styleNumber || `CHD-RG-${String(slideNum).padStart(4, '0')}`,
        technique: specs.technique || "WOVEN",
        content: specs.content || "COTTON + JUTE",
        size: specs.size || (i % 4 === 0 ? "24X36\"" : i % 4 === 1 ? "36X48\"" : i % 4 === 2 ? "48X72\"" : "60X84\""),
        season: specs.season || "EVERYDAY",
        theme: specs.theme || (i % 2 === 0 ? "MODERN" : "TRADITIONAL"),
        country: specs.country || "INDIA",
      };
    }),
  },
  placemats: {
    name: "Placemats",
    products: Array.from({ length: 25 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getSpecsFromJson('placemat', slideNum) || {};
      
      return {
        id: `placemat-${slideNum}`,
        src: getImageUrl('placemat', slideNum, 'image_01.jpg'),
        images: [
          getImageUrl('placemat', slideNum, 'image_01.jpg'),
          getImageUrl('placemat', slideNum, 'image_02.jpg'),
        ],
        title: `Elegant Placemat Set ${slideNum}`,
        description: `Beautiful placemat set perfect for dining occasions. Set of ${4 + (i % 3)} pieces with elegant design.`,
        tags: ["dining", "elegant", i % 2 === 0 ? "set" : "individual"],
        styleNumber: specs.styleNumber || `CHD-PM-${String(slideNum).padStart(4, '0')}`,
        technique: specs.technique || "WOVEN",
        content: specs.content || "COTTON + LINEN",
        size: specs.size || "13X18\"",
        season: specs.season || "EVERYDAY",
        country: specs.country || "INDIA",
        theme: specs.theme,
      };
    }),
  },
  runners: {
    name: "Table Runners",
    products: Array.from({ length: 19 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getSpecsFromJson('TableRunner', slideNum) || {};
      
      return {
        id: `runner-${slideNum}`,
        src: getImageUrl('TableRunner', slideNum, 'image_01.jpg'),
        images: [
          getImageUrl('TableRunner', slideNum, 'image_01.jpg'),
          getImageUrl('TableRunner', slideNum, 'image_02.jpg'),
        ],
        title: `Table Runner Design ${slideNum}`,
        description: `Elegant table runner to enhance your dining table. Available in various lengths and patterns.`,
        tags: ["dining", "elegant", "table decor"],
        styleNumber: specs.styleNumber || `CHD-TR-${String(slideNum).padStart(4, '0')}`,
        technique: specs.technique || "WOVEN",
        content: specs.content || "COTTON + JUTE",
        size: specs.size || (i % 3 === 0 ? "72\"" : i % 3 === 1 ? "90\"" : "108\""),
        season: specs.season || "EVERYDAY",
        country: specs.country || "INDIA",
        theme: specs.theme,
      };
    }),
  },
  cushions: {
    name: "Cushions",
    products: Array.from({ length: 556 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getSpecsFromJson('cushion', slideNum) || {};
      
      return {
        id: `cushion-${slideNum}`,
        src: getImageUrl('cushion', slideNum, 'image_01.jpg'),
        images: [
          getImageUrl('cushion', slideNum, 'image_01.jpg'),
          getImageUrl('cushion', slideNum, 'image_02.jpg'),
        ],
        title: `Decorative Cushion ${slideNum}`,
        description: `Comfortable and stylish cushion perfect for your living space. Available in multiple sizes and designs.`,
        tags: ["decorative", "comfort", "living room"],
        styleNumber: specs.styleNumber || `CHD-CU-${String(slideNum).padStart(4, '0')}`,
        technique: specs.technique || "WOVEN",
        content: specs.content || "COTTON",
        size: specs.size || (i % 4 === 0 ? "12X12\"" : i % 4 === 1 ? "16X16\"" : i % 4 === 2 ? "18X18\"" : "20X20\""),
        season: specs.season || "EVERYDAY",
        country: specs.country || "INDIA",
        theme: specs.theme,
      };
    }),
  },
  throws: {
    name: "Throws",
    products: Array.from({ length: 147 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getSpecsFromJson('throw', slideNum) || {};
      
      return {
        id: `throw-${slideNum}`,
        src: getImageUrl('throw', slideNum, 'image_01.jpg'),
        images: [
          getImageUrl('throw', slideNum, 'image_01.jpg'),
          getImageUrl('throw', slideNum, 'image_02.jpg'),
        ],
        title: `Cozy Throw Blanket ${slideNum}`,
        description: `Soft and warm throw blanket for ultimate comfort. Perfect for snuggling on the couch.`,
        tags: ["soft", "cozy", "blanket"],
        styleNumber: specs.styleNumber || `CHD-TH-${String(slideNum).padStart(4, '0')}`,
        technique: specs.technique || "WOVEN",
        content: specs.content || "COTTON + ACRYLIC",
        size: specs.size || (i % 2 === 0 ? "50X60\"" : "60X80\""),
        season: specs.season || "EVERYDAY",
        country: specs.country || "INDIA",
        theme: specs.theme,
      };
    }),
  },
  bedding: {
    name: "Premium Bedding",
    products: Array.from({ length: 42 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getSpecsFromJson('bedding', slideNum) || {};
      
      return {
        id: `bedding-${slideNum}`,
        src: getImageUrl('bedding', slideNum, 'image_01.jpg'),
        images: [
          getImageUrl('bedding', slideNum, 'image_01.jpg'),
          getImageUrl('bedding', slideNum, 'image_02.jpg'),
        ],
        title: `Premium Bedding Set ${slideNum}`,
        description: `Luxury bedding collection for a comfortable night's sleep. High thread count and premium materials.`,
        tags: ["luxury", "bedroom", "comfortable"],
        styleNumber: specs.styleNumber || `CHD-BD-${String(slideNum).padStart(4, '0')}`,
        technique: specs.technique || "WOVEN",
        content: specs.content || "COTTON",
        size: specs.size || (i % 4 === 0 ? "TWIN" : i % 4 === 1 ? "FULL" : i % 4 === 2 ? "QUEEN" : "KING"),
        season: specs.season || "EVERYDAY",
        country: specs.country || "INDIA",
        theme: specs.theme,
      };
    }),
  }, 
  bathmats: {
    name: "Bath Mats",
    products: Array.from({ length: 12 }, (_, i) => ({
      id: `bathmat-${i + 1}`,
      src: i % 2 === 0 ? lifestyleBathmat : bathmatImage,
      images: [
        i % 2 === 0 ? lifestyleBathmat : bathmatImage,
        bathmatImage, // Image 2 (replace with actual product image)
      ],
      title: `Spa Bath Mat ${i + 1}`,
      description: `Highly absorbent and quick-drying bath mat. Bring spa-like luxury to your bathroom.`,
      tags: ["spa", "bathroom", "absorbent"],
      styleNumber: `CHD-BM-${String(i + 1).padStart(4, '0')}`,
      technique: "WOVEN",
      content: "COTTON + MICROFIBER",
      size: i % 2 === 0 ? "20X30\"" : "24X36\"",
      season: "EVERYDAY",
      country: "INDIA",
    })),
  },
  chairpads: {
    name: "Chair Pads",
    products: Array.from({ length: 10 }, (_, i) => ({
      id: `chairpad-${i + 1}`,
      src: i % 2 === 0 ? lifestyleChairpad : chairpadImage,
      images: [
        i % 2 === 0 ? lifestyleChairpad : chairpadImage,
        chairpadImage, // Image 2 (replace with actual product image)
      ],
      title: `Chair Pad Set ${i + 1}`,
      description: `Comfortable chair pads for your dining chairs. Available in various colors and patterns.`,
      tags: ["dining", "comfortable", "cushion"],
      styleNumber: `CHD-CP-${String(i + 1).padStart(4, '0')}`,
      technique: "WOVEN",
      content: "COTTON + POLYESTER",
      size: "STANDARD",
      season: "EVERYDAY",
      country: "INDIA",
    })),
  },
};

const Category = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  // const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // For gallery modal (commented out)

  const category = categoryId ? categoryData[categoryId] : null;

  const filteredProducts = useMemo(() => {
    if (!category) return [];
    if (!searchQuery.trim()) return category.products;

    const query = searchQuery.toLowerCase();
    return category.products.filter(
      (product) =>
        product.title.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query) ||
        product.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [category, searchQuery]);

  const handleProductClick = (productId: string) => {
    navigate(`/category/${categoryId}/${productId}`);
  };

  // ============================================================================
  // OLD GALLERY MODAL FUNCTIONS - COMMENTED OUT BUT PRESERVED
  // These were used when clicking images opened a fullscreen gallery modal
  // ============================================================================
  /*
  const openGallery = (index: number) => {
    setSelectedIndex(index);
    document.body.style.overflow = "hidden";
  };

  const closeGallery = () => {
    setSelectedIndex(null);
    document.body.style.overflow = "unset";
  };

  const goToPrevious = () => {
    if (selectedIndex !== null) {
      setSelectedIndex((selectedIndex - 1 + filteredProducts.length) % filteredProducts.length);
    }
  };

  const goToNext = () => {
    if (selectedIndex !== null) {
      setSelectedIndex((selectedIndex + 1) % filteredProducts.length);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") closeGallery();
    if (e.key === "ArrowLeft") goToPrevious();
    if (e.key === "ArrowRight") goToNext();
  };
  */
  // ============================================================================
  // END OF OLD GALLERY MODAL FUNCTIONS
  // ============================================================================

  if (!category) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-light mb-4">Category Not Found</h1>
          <Link to="/" className="text-accent hover:underline">
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen py-24 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <Link
              to="/#products"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-accent transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Products
            </Link>
            <h1 className="text-4xl md:text-6xl font-light mb-4">{category.name}</h1>
          </div>

          {/* Search Bar */}
          <div className="mb-12 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by keywords (e.g., handwoven, natural)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Products Grid */}
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => handleProductClick(product.id)}
                  className="group relative aspect-square overflow-hidden bg-card border border-border cursor-pointer transition-all hover:border-accent hover:shadow-lg"
                >
                  <img
                    src={product.src}
                    alt={product.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                    <div>
                      <h3 className="text-lg font-light text-foreground mb-2">{product.title}</h3>
                      <div className="flex flex-wrap gap-2">
                        {product.tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="text-xs px-2 py-1 bg-accent/20 text-accent rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg">No products found matching "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery("")}
                className="mt-4 text-accent hover:underline"
              >
                Clear search
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================================
          OLD FULLSCREEN GALLERY MODAL - COMMENTED OUT BUT PRESERVED
          This was the modal that opened when clicking images before
          ============================================================================ */}
      {/* 
      {selectedIndex !== null && (
        <div
          className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center"
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          <button
            onClick={closeGallery}
            className="absolute top-6 right-6 p-2 hover:bg-accent/10 rounded-full transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          <button
            onClick={goToPrevious}
            className="absolute left-6 p-3 hover:bg-accent/10 rounded-full transition-colors z-10"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          <button
            onClick={goToNext}
            className="absolute right-6 p-3 hover:bg-accent/10 rounded-full transition-colors z-10"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          <div className="max-w-5xl max-h-[90vh] w-full mx-6 flex flex-col">
            <img
              src={filteredProducts[selectedIndex].src}
              alt={filteredProducts[selectedIndex].title}
              className="w-full h-auto object-contain"
            />
            <div className="mt-6 text-center">
              <h3 className="text-2xl font-light mb-2">{filteredProducts[selectedIndex].title}</h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {filteredProducts[selectedIndex].tags.map((tag) => (
                  <span key={tag} className="text-sm px-3 py-1 bg-accent/20 text-accent rounded">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      */}
      {/* ============================================================================
          END OF OLD FULLSCREEN GALLERY MODAL
          ============================================================================ */}
    </>
  );
};

export default Category;
