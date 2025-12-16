import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  country?: string;
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
// Returns both possible URLs - component will try jpg first, then png
function getImageUrl(category: string, slideNumber: number, imageName: string): string {
  const slideNum = String(slideNumber).padStart(3, '0');
  const imageNameBase = imageName.replace(/\.(jpg|png)$/, '');
  
  // Return jpg path - the img component will handle fallback to png
  return `/images/${category}/slide_${slideNum}/${imageNameBase}.jpg`;
}

// Get fallback URL (png version)
function getImageUrlPng(category: string, slideNumber: number, imageName: string): string {
  const slideNum = String(slideNumber).padStart(3, '0');
  const imageNameBase = imageName.replace(/\.(jpg|png)$/, '');
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

// Generate searchable tags from product fields (description, technique, content)
function generateProductTags(specs: { description?: string; technique?: string; content?: string }): string[] {
  const tags: string[] = [];
  
  // Add description as tag (cleaned up)
  if (specs.description) {
    const desc = specs.description.trim().toUpperCase();
    if (desc && desc.length <= 20) {
      tags.push(desc);
    }
  }
  
  // Add technique as tag
  if (specs.technique) {
    tags.push(specs.technique.trim().toUpperCase());
  }
  
  // Split content by common separators and add each material as tag
  if (specs.content) {
    const materials = specs.content
      .split(/[+,\/&]/)
      .map(m => m.trim().toUpperCase())
      .filter(m => m.length > 0);
    tags.push(...materials);
  }
  
  // Remove duplicates and return max 3 tags
  const uniqueTags = [...new Set(tags)].slice(0, 3);
  return uniqueTags;
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
    name: "Tote Bags",
    images: [
      { src: lifestyleChairpad, title: "Tote Bags in Use", tags: ["tote", "bag", "carry"] },
      { src: chairpadImage, title: "Tote Bag Collection", tags: ["tote", "bag", "everyday"] },
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
  productDescription?: string; // e.g., "RUG", "CUSHION" (from data.json description field)
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
      const specs = getDataFromJson('rugs', slideNum) || {};
      const technique = specs.technique || "WOVEN";
      const content = specs.content || "COTTON + JUTE";
      const description = specs.description || "RUG";
      
      return {
        id: `rug-${slideNum}`,
        src: getLifestyleImageUrl('rugs', slideNum),
        images: getProductImages('rugs', slideNum),
        title: specs.styleNumber || `CHD-RG-${String(slideNum).padStart(4, '0')}`,
        description: `Premium quality handwoven rug with unique design pattern ${slideNum}. Crafted with precision and care using traditional weaving techniques.`,
        tags: generateProductTags({ description, technique, content }),
        styleNumber: specs.styleNumber || `CHD-RG-${String(slideNum).padStart(4, '0')}`,
        technique,
        content,
        size: specs.size || (i % 4 === 0 ? "24X36\"" : i % 4 === 1 ? "36X48\"" : i % 4 === 2 ? "48X72\"" : "60X84\""),
        season: specs.season || "EVERYDAY",
      };
    }),
  },
  placemats: {
    name: "Placemats",
    products: Array.from({ length: 25 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('placemat', slideNum) || {};
      const technique = specs.technique || "WOVEN";
      const content = specs.content || "COTTON + LINEN";
      const description = specs.description || "PLACEMAT";
      
      return {
        id: `placemat-${slideNum}`,
        src: getLifestyleImageUrl('placemat', slideNum),
        images: getProductImages('placemat', slideNum),
        title: specs.styleNumber || `CHD-PM-${String(slideNum).padStart(4, '0')}`,
        description: `Beautiful placemat set perfect for dining occasions. Set of ${4 + (i % 3)} pieces with elegant design.`,
        tags: generateProductTags({ description, technique, content }),
        styleNumber: specs.styleNumber || `CHD-PM-${String(slideNum).padStart(4, '0')}`,
        technique,
        content,
        size: specs.size || "13X18\"",
        season: specs.season || "EVERYDAY",
      };
    }),
  },
  runners: {
    name: "Table Runners",
    products: Array.from({ length: 19 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('TableRunner', slideNum) || {};
      const technique = specs.technique || "WOVEN";
      const content = specs.content || "COTTON + JUTE";
      const description = specs.description || "TABLE RUNNER";
      
      return {
        id: `runner-${slideNum}`,
        // Use lifestyle as main, plus product shots and table
        src: getImageUrlPng('TableRunner', slideNum, 'lifestyle.png'),
        images: getProductImages('TableRunner', slideNum, true), // Use PNG for TableRunner
        title: specs.styleNumber || `CHD-TR-${String(slideNum).padStart(4, '0')}`,
        description: `Elegant table runner to enhance your dining table. Available in various lengths and patterns.`,
        tags: generateProductTags({ description, technique, content }),
        styleNumber: specs.styleNumber || `CHD-TR-${String(slideNum).padStart(4, '0')}`,
        technique,
        content,
        size: specs.size || (i % 3 === 0 ? "72\"" : i % 3 === 1 ? "90\"" : "108\""),
        season: specs.season || "EVERYDAY",
      };
    }),
  },
  cushions: {
    name: "Cushions",
    products: Array.from({ length: 556 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('cushion', slideNum) || {};
      const technique = specs.technique || "WOVEN";
      const content = specs.content || "COTTON";
      const description = specs.description || "CUSHION";
      
      return {
        id: `cushion-${slideNum}`,
        src: getLifestyleImageUrl('cushion', slideNum),
        images: getProductImages('cushion', slideNum),
        title: specs.styleNumber || `CHD-CU-${String(slideNum).padStart(4, '0')}`,
        description: `Comfortable and stylish cushion perfect for your living space. Available in multiple sizes and designs.`,
        tags: generateProductTags({ description, technique, content }),
        styleNumber: specs.styleNumber || `CHD-CU-${String(slideNum).padStart(4, '0')}`,
        technique,
        content,
        size: specs.size || (i % 4 === 0 ? "12X12\"" : i % 4 === 1 ? "16X16\"" : i % 4 === 2 ? "18X18\"" : "20X20\""),
        season: specs.season || "EVERYDAY",
      };
    }),
  },
  throws: {
    name: "Throws",
    products: Array.from({ length: 147 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('throw', slideNum) || {};
      const technique = specs.technique || "WOVEN";
      const content = specs.content || "COTTON + ACRYLIC";
      const description = specs.description || "THROW";
      
      return {
        id: `throw-${slideNum}`,
        src: getLifestyleImageUrl('throw', slideNum),
        images: getProductImages('throw', slideNum, true), // Use PNG for throw
        title: specs.styleNumber || `CHD-TH-${String(slideNum).padStart(4, '0')}`,
        description: `Soft and warm throw blanket for ultimate comfort. Perfect for snuggling on the couch.`,
        tags: generateProductTags({ description, technique, content }),
        styleNumber: specs.styleNumber || `CHD-TH-${String(slideNum).padStart(4, '0')}`,
        technique,
        content,
        size: specs.size || (i % 2 === 0 ? "50X60\"" : "60X80\""),
        season: specs.season || "EVERYDAY",
      };
    }),
  },
  bedding: {
    name: "Premium Bedding",
    products: Array.from({ length: 39 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('bedding', slideNum) || {};
      const technique = specs.technique || "WOVEN";
      const content = specs.content || "COTTON";
      const description = specs.description || "BEDDING";
      
      return {
        id: `bedding-${slideNum}`,
        src: getLifestyleImageUrl('bedding', slideNum),
        images: getProductImages('bedding', slideNum),
        title: specs.styleNumber || `CHD-BD-${String(slideNum).padStart(4, '0')}`,
        description: `Luxury bedding collection for a comfortable night's sleep. High thread count and premium materials.`,
        tags: generateProductTags({ description, technique, content }),
        styleNumber: specs.styleNumber || `CHD-BD-${String(slideNum).padStart(4, '0')}`,
        technique,
        content,
        size: specs.size || (i % 4 === 0 ? "TWIN" : i % 4 === 1 ? "FULL" : i % 4 === 2 ? "QUEEN" : "KING"),
        season: specs.season || "EVERYDAY",
      };
    }),
  }, 
  bathmats: {
    name: "Bath Mats",
    products: Array.from({ length: 149 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('bathmat', slideNum) || {};
      const technique = specs.technique || "WOVEN";
      const content = specs.content || "COTTON + MICROFIBER";
      const description = specs.description || "BATH MAT";
      
      return {
        id: `bathmat-${slideNum}`,
        src: getLifestyleImageUrlPng('bathmat', slideNum),
        images: getProductImages('bathmat', slideNum, true), // Use PNG for bathmat
        title: specs.styleNumber || `CHD-BM-${String(slideNum).padStart(4, '0')}`,
        description: specs.description || `Highly absorbent and quick-drying bath mat. Bring spa-like luxury to your bathroom.`,
        tags: generateProductTags({ description, technique, content }),
        styleNumber: specs.styleNumber || `CHD-BM-${String(slideNum).padStart(4, '0')}`,
        productDescription: specs.description,
        technique,
        content,
        size: specs.size || (i % 2 === 0 ? "20X30\"" : "24X36\""),
        season: specs.season || "EVERYDAY",
        country: specs.country || "INDIA",
      };
    }),
  },
  chairpads: {
    name: "Tote Bags",
    products: Array.from({ length: 46 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('totebag', slideNum) || {};
      const technique = specs.technique || "PRINTED";
      const content = specs.content || "COTTON";
      const description = specs.description || "TOTE BAG";
      
      return {
        id: `chairpad-${slideNum}`,
        src: getLifestyleImageUrlPng('totebag', slideNum),
        images: getProductImages('totebag', slideNum), // Use JPG for totebag
        title: specs.styleNumber || `CHD-TB-${String(slideNum).padStart(4, '0')}`,
        description: specs.description || `Durable reusable tote bag for everyday carry, errands, and travel.`,
        tags: generateProductTags({ description, technique, content }),
        styleNumber: specs.styleNumber || `CHD-TB-${String(slideNum).padStart(4, '0')}`,
        productDescription: specs.description,
        technique,
        content,
        size: specs.size || "STANDARD",
        season: specs.season || "EVERYDAY",
        country: specs.country || "INDIA",
      };
    }),
  },
};

// Number of products to load initially and on each scroll
const ITEMS_PER_PAGE = 9;

const ProductCard = ({
  product,
  onClick,
}: {
  product: Product;
  onClick: () => void;
}) => {
  // Use all images: [lifestyle, image_01, image_02, table]
  // Filter out any undefined/null images
  const images = (product.images && product.images.length > 0)
    ? product.images.filter(Boolean)
    : [product.src].filter(Boolean);
  
  // Thumbnails: show lifestyle (0), image_01 (1), image_02 (2) - NO table images
  // Only show thumbnails for images that exist (excluding table images)
  const thumbImages = images.filter((img) => img && !img.includes('table_01'));

  const [hovered, setHovered] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [thumbHover, setThumbHover] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const resumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track which thumbnail indices have failed to load (both jpg and png failed)
  const [failedThumbIndices, setFailedThumbIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    // Clear any existing timers
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (resumeTimeoutRef.current) {
      clearTimeout(resumeTimeoutRef.current);
      resumeTimeoutRef.current = null;
    }

    // Count valid images (excluding failed ones)
    const validImageCount = images.length - failedThumbIndices.size;
    if (!hovered || thumbHover || validImageCount < 2) return;

    // Small delay before resuming auto-rotate after thumbnail hover
    resumeTimeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        setActiveIdx((prev) => {
          // Find next valid index (skip failed images)
          let nextIdx = (prev + 1) % images.length;
          while (failedThumbIndices.has(nextIdx) && nextIdx !== prev) {
            nextIdx = (nextIdx + 1) % images.length;
          }
          return nextIdx;
        });
      }, 2000); // 2s while hovered
    }, 400);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, [hovered, thumbHover, images.length, failedThumbIndices]);

  // Reset to first image when hover ends
  useEffect(() => {
    if (!hovered) {
      setActiveIdx(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [hovered]);

  const mainImage = images[activeIdx] ?? images[0];

  // Check if current image is table image (wider aspect ratio needs special handling)
  const isTableImage = mainImage.includes('table_01');
  
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative aspect-square overflow-hidden bg-card border border-border cursor-pointer transition-all hover:border-accent hover:shadow-lg"
    >
      <div className="absolute inset-0 bg-background">
        {/* Background image only for non-table images to prevent white flash */}
        {!isTableImage && (
          <div
            className="absolute inset-0 bg-background"
            style={{
              backgroundImage: `url(${mainImage})`,
              backgroundSize: "contain",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        )}
        <img
          key={mainImage}
          src={mainImage}
          alt={product.title}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-contain transition-transform duration-700 relative z-10 opacity-100 ${
            isTableImage ? 'group-hover:scale-100' : 'group-hover:scale-110'
          }`}
          style={{
            padding: isTableImage ? '8px' : '0',
          }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            // Try png if jpg fails
            if (target.src.endsWith('.jpg')) {
              target.src = target.src.replace('.jpg', '.png');
            } else {
              // If png also fails or it's already png, mark as failed and move to next
              setFailedThumbIndices(prev => new Set([...prev, activeIdx]));
              // Find next valid image
              const nextValidIdx = images.findIndex((_, idx) => idx !== activeIdx && !failedThumbIndices.has(idx));
              if (nextValidIdx !== -1) {
                setActiveIdx(nextValidIdx);
              }
            }
          }}
        />
      </div>

      <div className="absolute inset-0 z-30 bg-gradient-to-t from-background/75 via-background/40 to-transparent transition-opacity duration-300 flex items-end p-6">
        <div className="flex flex-col items-start gap-2">
          <div>
            <h3 className="text-lg font-light text-foreground mb-1 drop-shadow-sm">{product.title}</h3>
            <div className="flex flex-wrap gap-2">
              {product.tags.slice(0, 3).map((tag, idx) => (
                <span key={idx} className="text-xs px-2 py-1 bg-accent text-accent-foreground rounded shadow-sm">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {hovered && thumbImages.filter((_, idx) => !failedThumbIndices.has(idx)).length > 1 && (
            <div className="flex gap-2 bg-background/90 backdrop-blur-md p-2 rounded-xl shadow-md border border-border/60">
              {thumbImages.map((thumb, idx) => {
                // Skip rendering thumbnails that failed to load
                if (failedThumbIndices.has(idx)) return null;
                
                return (
                  <button
                    key={idx}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      setThumbHover(true);
                      setActiveIdx(idx);
                    }}
                    onMouseLeave={() => setThumbHover(false)}
                    className={`w-12 h-12 md:w-14 md:h-14 rounded-lg overflow-hidden border ${activeIdx === idx ? "border-accent" : "border-border"} transition`}
                  >
                    <img
                      src={thumb}
                      alt={`thumb-${idx + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src.endsWith('.jpg')) {
                          target.src = target.src.replace('.jpg', '.png');
                        } else {
                          // Both jpg and png failed - mark as failed and hide
                          setFailedThumbIndices(prev => new Set([...prev, idx]));
                        }
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Category = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  
  // Initialize state from sessionStorage if returning from product detail
  const getInitialVisibleCount = () => {
    if (categoryId) {
      const saved = sessionStorage.getItem(`category-count-${categoryId}`);
      if (saved) {
        const count = parseInt(saved, 10);
        return count > ITEMS_PER_PAGE ? count : ITEMS_PER_PAGE;
      }
    }
    return ITEMS_PER_PAGE;
  };
  
  const getInitialSearchQuery = () => {
    if (categoryId) {
      return sessionStorage.getItem(`category-search-${categoryId}`) || "";
    }
    return "";
  };
  
  const [searchQuery, setSearchQuery] = useState(getInitialSearchQuery);
  const [visibleCount, setVisibleCount] = useState(getInitialVisibleCount);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [pendingScroll, setPendingScroll] = useState<number | null>(() => {
    if (categoryId) {
      const saved = sessionStorage.getItem(`category-scroll-${categoryId}`);
      return saved ? parseInt(saved, 10) : null;
    }
    return null;
  });

  const category = categoryId ? categoryData[categoryId] : null;

  const filteredProducts = useMemo(() => {
    if (!category) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return category.products;

    return category.products.filter((product) => {
      const title = product.title?.toLowerCase() ?? "";
      const desc = product.description?.toLowerCase() ?? "";
      const tags = product.tags ?? [];
      const style = product.styleNumber?.toLowerCase() ?? "";
      const prodDesc = product.productDescription?.toLowerCase() ?? "";
      const technique = product.technique?.toLowerCase() ?? "";
      const content = product.content?.toLowerCase() ?? "";
      const size = product.size?.toLowerCase() ?? "";
      const season = product.season?.toLowerCase() ?? "";

      return (
        title.includes(query) ||
        desc.includes(query) ||
        style.includes(query) ||
        prodDesc.includes(query) ||
        technique.includes(query) ||
        content.includes(query) ||
        size.includes(query) ||
        season.includes(query) ||
        tags.some((tag) => (tag ?? "").toLowerCase().includes(query))
    );
    });
  }, [category, searchQuery]);

  // Products currently visible (paginated)
  const visibleProducts = useMemo(() => {
    return filteredProducts.slice(0, visibleCount);
  }, [filteredProducts, visibleCount]);

  const hasMore = visibleCount < filteredProducts.length;

  // Reset visible count when search query changes (but not on initial load with restored state)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // Only reset if not restoring scroll
    if (pendingScroll === null) {
      setVisibleCount(ITEMS_PER_PAGE);
    }
  }, [searchQuery]);

  // Restore scroll position after products are rendered
  useEffect(() => {
    if (pendingScroll !== null && visibleProducts.length > 0) {
      // Wait for DOM to update with products
      requestAnimationFrame(() => {
        setTimeout(() => {
          window.scrollTo({ top: pendingScroll, behavior: 'instant' });
          // Clear saved data after restoring
          if (categoryId) {
            sessionStorage.removeItem(`category-scroll-${categoryId}`);
            sessionStorage.removeItem(`category-count-${categoryId}`);
            sessionStorage.removeItem(`category-search-${categoryId}`);
          }
          setPendingScroll(null);
        }, 50);
      });
    }
  }, [pendingScroll, visibleProducts.length, categoryId]);

  // Scroll to top when category changes (only if not restoring scroll)
  useEffect(() => {
    if (pendingScroll === null) {
      window.scrollTo(0, 0);
    }
  }, [categoryId]);

  // Infinite scroll - load more when scrolling to bottom
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && hasMore && !isLoadingMore) {
          setIsLoadingMore(true);
          // Small delay for smooth UX
          setTimeout(() => {
            setVisibleCount((prev) => prev + ITEMS_PER_PAGE);
            setIsLoadingMore(false);
          }, 300);
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoadingMore]);

  const handleProductClick = (productId: string) => {
    // Save scroll position and state before navigating
    if (categoryId) {
      sessionStorage.setItem(`category-scroll-${categoryId}`, window.scrollY.toString());
      sessionStorage.setItem(`category-count-${categoryId}`, visibleCount.toString());
      if (searchQuery) {
        sessionStorage.setItem(`category-search-${categoryId}`, searchQuery);
      }
    }
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

          {/* Product Count */}
          <div className="mb-6 text-sm text-muted-foreground">
            Showing {visibleProducts.length} of {filteredProducts.length} products
          </div>

          {/* Products Grid */}
          {filteredProducts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={() => handleProductClick(product.id)}
                  />
                ))}
              </div>

              {/* Load More Trigger & Indicator */}
              <div ref={loadMoreRef} className="py-8 flex justify-center">
                {isLoadingMore && (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Loading more products...</span>
                  </div>
                )}
                {!hasMore && filteredProducts.length > ITEMS_PER_PAGE && (
                  <p className="text-muted-foreground text-sm">You've seen all {filteredProducts.length} products</p>
                )}
              </div>
            </>
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
