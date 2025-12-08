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
      };
    }),
  },
  placemats: {
    name: "Placemats",
    products: Array.from({ length: 25 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('placemat', slideNum) || {};
      
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
      };
    }),
  },
  runners: {
    name: "Table Runners",
    products: Array.from({ length: 19 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('TableRunner', slideNum) || {};
      
      return {
        id: `runner-${slideNum}`,
        // Use product images only (remove baby lifestyle image)
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
      };
    }),
  },
  cushions: {
    name: "Cushions",
    products: Array.from({ length: 556 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('cushion', slideNum) || {};
      
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
      };
    }),
  },
  throws: {
    name: "Throws",
    products: Array.from({ length: 147 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('throw', slideNum) || {};
      
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
      };
    }),
  },
  bedding: {
    name: "Premium Bedding",
    products: Array.from({ length: 42 }, (_, i) => {
      const slideNum = i + 1;
      const specs = getDataFromJson('bedding', slideNum) || {};
      
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
    name: "Tote Bags",
    products: Array.from({ length: 10 }, (_, i) => ({
      id: `chairpad-${i + 1}`,
      src: i % 2 === 0 ? lifestyleChairpad : chairpadImage,
      images: [
        i % 2 === 0 ? lifestyleChairpad : chairpadImage,
        chairpadImage, // Image 2 (replace with actual product image)
      ],
      title: `Tote Bag ${i + 1}`,
      description: `Durable reusable tote bag for everyday carry, errands, and travel.`,
      tags: ["tote", "bag", "carry"],
      styleNumber: `CHD-TB-${String(i + 1).padStart(4, '0')}`,
      technique: "WOVEN",
      content: "COTTON + POLYESTER",
      size: "STANDARD",
      season: "EVERYDAY",
      country: "INDIA",
    })),
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
  const images = (product.images && product.images.length > 0)
    ? (product.id.startsWith("runner") ? product.images : product.images.slice(0, 2))
    : [product.src];
  const thumbImages = product.id.startsWith("runner")
    ? images.slice(0, 3)
    : images.slice(0, 2);

  const [hovered, setHovered] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [thumbHover, setThumbHover] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const resumeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    if (!hovered || thumbHover || images.length < 2) return;

    // Small delay before resuming auto-rotate after thumbnail hover
    resumeTimeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        setActiveIdx((prev) => (prev + 1) % images.length);
      }, 2000); // 2s while hovered
    }, 400);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, [hovered, thumbHover, images.length]);

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

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative aspect-square overflow-hidden bg-card border border-border cursor-pointer transition-all hover:border-accent hover:shadow-lg"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${mainImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <img
        key={mainImage}
        src={mainImage}
        alt={product.title}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 relative z-10 opacity-100"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (target.src.endsWith('.jpg')) {
            target.src = target.src.replace('.jpg', '.png');
          } else {
            target.src = product.src;
          }
        }}
      />

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

          {hovered && thumbImages.length > 1 && (
            <div className="flex gap-2 bg-background/90 backdrop-blur-md p-2 rounded-xl shadow-md border border-border/60">
              {thumbImages.map((thumb, idx) => (
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
                        target.src = product.src;
                      }
                    }}
                  />
                </button>
              ))}
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
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

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

  // Reset visible count when search query or category changes
  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [searchQuery, categoryId]);

  // Scroll to top when category changes
  useEffect(() => {
    window.scrollTo(0, 0);
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
