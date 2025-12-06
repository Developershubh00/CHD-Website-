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
  images?: string[]; // Array of 3 images for product detail page (optional for category page)
  title: string;
  description: string;
  tags: string[];
};

// Category data structure - each category has multiple products
const categoryData: Record<string, { 
  name: string; 
  products: Product[];
}> = {
  rugs: {
    name: "Rugs",
    products: Array.from({ length: 42 }, (_, i) => ({
      id: `rug-${i + 1}`,
      src: i % 2 === 0 ? lifestyleRug : rugImage, // Alternate between images for demo
      title: `Handwoven Rug Type ${i + 1}`,
      description: `Premium quality handwoven rug with unique design pattern ${i + 1}. Crafted with precision and care using traditional weaving techniques.`,
      tags: ["handwoven", "natural", i % 3 === 0 ? "living room" : i % 3 === 1 ? "bedroom" : "dining"],
    })),
  },
  placemats: {
    name: "Placemats",
    products: Array.from({ length: 20 }, (_, i) => ({
      id: `placemat-${i + 1}`,
      src: i % 2 === 0 ? lifestylePlacemat : placematImage,
      title: `Elegant Placemat Set ${i + 1}`,
      description: `Beautiful placemat set perfect for dining occasions. Set of ${4 + (i % 3)} pieces with elegant design.`,
      tags: ["dining", "elegant", i % 2 === 0 ? "set" : "individual"],
    })),
  },
  runners: {
    name: "Table Runners",
    products: Array.from({ length: 15 }, (_, i) => ({
      id: `runner-${i + 1}`,
      src: i % 2 === 0 ? lifestyleRunner : runnerImage,
      title: `Table Runner Design ${i + 1}`,
      description: `Elegant table runner to enhance your dining table. Available in various lengths and patterns.`,
      tags: ["dining", "elegant", "table decor"],
    })),
  },
  cushions: {
    name: "Cushions",
    products: Array.from({ length: 30 }, (_, i) => ({
      id: `cushion-${i + 1}`,
      src: cushionImage,
      title: `Decorative Cushion ${i + 1}`,
      description: `Comfortable and stylish cushion perfect for your living space. Available in multiple sizes and designs.`,
      tags: ["decorative", "comfort", "living room"],
    })),
  },
  throws: {
    name: "Throws",
    products: Array.from({ length: 18 }, (_, i) => ({
      id: `throw-${i + 1}`,
      src: throwImage,
      title: `Cozy Throw Blanket ${i + 1}`,
      description: `Soft and warm throw blanket for ultimate comfort. Perfect for snuggling on the couch.`,
      tags: ["soft", "cozy", "blanket"],
    })),
  },
  bedding: {
    name: "Premium Bedding",
    products: Array.from({ length: 25 }, (_, i) => ({
      id: `bedding-${i + 1}`,
      src: i % 2 === 0 ? lifestyleBedding : beddingImage,
      title: `Premium Bedding Set ${i + 1}`,
      description: `Luxury bedding collection for a comfortable night's sleep. High thread count and premium materials.`,
      tags: ["luxury", "bedroom", "comfortable"],
    })),
  }, 
  bathmats: {
    name: "Bath Mats",
    products: Array.from({ length: 12 }, (_, i) => ({
      id: `bathmat-${i + 1}`,
      src: i % 2 === 0 ? lifestyleBathmat : bathmatImage,
      title: `Spa Bath Mat ${i + 1}`,
      description: `Highly absorbent and quick-drying bath mat. Bring spa-like luxury to your bathroom.`,
      tags: ["spa", "bathroom", "absorbent"],
    })),
  },
  chairpads: {
    name: "Chair Pads",
    products: Array.from({ length: 10 }, (_, i) => ({
      id: `chairpad-${i + 1}`,
      src: i % 2 === 0 ? lifestyleChairpad : chairpadImage,
      title: `Chair Pad Set ${i + 1}`,
      description: `Comfortable chair pads for your dining chairs. Available in various colors and patterns.`,
      tags: ["dining", "comfortable", "cushion"],
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
    navigate(`/category/${categoryId}/product/${productId}`);
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
