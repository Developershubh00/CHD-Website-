import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import rugImage from "@/assets/product-rug.png";
import placematImage from "@/assets/product-placemat.png";
import runnerImage from "@/assets/product-runner.png";
import cushionImage from "@/assets/product-cushion.jpg";
import throwImage from "@/assets/product-throw.jpg";
import beddingImage from "@/assets/product-bedding.jpg";
import bathmatImage from "@/assets/product-bathmat.jpg";
import chairpadImage from "@/assets/product-chairpad.jpg";

const categories = [
  {
    id: "rugs",
    name: "Rugs",
    image: rugImage,
    description: "Handwoven rugs for every space",
  },
  {
    id: "placemats",
    name: "Placemats",
    image: placematImage,
    description: "Elegant table settings for dining",
  },
  {
    id: "runners",
    name: "Table Runners",
    image: runnerImage,
    description: "Beautiful runners for your tables",
  },
  {
    id: "cushions",
    name: "Cushions",
    image: cushionImage,
    description: "Comfortable cushions",
  },
  {
    id: "throws",
    name: "Throws",
    image: throwImage,
    description: "Soft throws and blankets",
  },
  {
    id: "bedding",
    name: "Premium Bedding",
    image: beddingImage,
    description: "Luxury bedding collections",
  },
  {
    id: "bathmats",
    name: "Bath Mats",
    image: bathmatImage,
    description: "Spa-quality bath mats",
  },
  {
    id: "chairpads",
    name: "Tote Bags",
    image: chairpadImage,
    description: "Durable reusable totes",
  },
];

const baseImageMap: Record<string, string> = {
  rugs: rugImage,
  placemats: placematImage,
  runners: runnerImage,
  cushions: cushionImage,
  throws: throwImage,
  bedding: beddingImage,
  bathmats: bathmatImage,
  chairpads: chairpadImage,
};

// Use lifestyle images from slides 1-6 for rotation
const categoryImagesMap: Record<string, string[]> = {
  rugs: [baseImageMap.rugs, ...Array.from({ length: 6 }, (_, i) => `/images/rugs/slide_${String(i + 1).padStart(3, "0")}/lifestyle.jpg`)],
  placemats: [baseImageMap.placemats, ...Array.from({ length: 6 }, (_, i) => `/images/placemat/slide_${String(i + 1).padStart(3, "0")}/lifestyle.jpg`)],
  runners: [baseImageMap.runners, ...Array.from({ length: 6 }, (_, i) => `/images/TableRunner/slide_${String(i + 1).padStart(3, "0")}/lifestyle.png`)],
  cushions: [baseImageMap.cushions, ...Array.from({ length: 6 }, (_, i) => `/images/cushion/slide_${String(i + 1).padStart(3, "0")}/lifestyle.jpg`)],
  throws: [baseImageMap.throws, ...Array.from({ length: 6 }, (_, i) => `/images/throw/slide_${String(i + 1).padStart(3, "0")}/lifestyle.jpg`)],
  bedding: [baseImageMap.bedding, ...Array.from({ length: 6 }, (_, i) => `/images/bedding/slide_${String(i + 1).padStart(3, "0")}/lifestyle.jpg`)],
  bathmats: [baseImageMap.bathmats, ...Array.from({ length: 6 }, (_, i) => `/images/bathmat/slide_${String(i + 1).padStart(3, "0")}/lifestyle.png`)],
  chairpads: [baseImageMap.chairpads, ...Array.from({ length: 6 }, (_, i) => `/images/totebag/slide_${String(i + 1).padStart(3, "0")}/lifestyle.png`)],
};

// Column-based staggered intervals (slower, smoother): col1+5 =>5.0s, col2+6 =>6.2s, col3+7=>7.4s, col4+8=>5.6s
const intervalPattern = [5000, 6200, 7400, 8600];

// Snake pattern mapping for 4-column grid: top-left→right→bottom-right→left
// Visual order: [0][1][2][3] then [7][6][5][4]
//                [4][5][6][7]
const snakePattern = [0, 1, 2, 3, 7, 6, 5, 4];

export const ProductCategoriesSpatial = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [activeIndexes, setActiveIndexes] = useState<number[]>(() => categories.map(() => 0));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
        const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
        setMousePosition({ x, y });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // rotate card images with snake pattern - each card rotates every 5000ms but offset by its position
  useEffect(() => {
    const intervals: Array<ReturnType<typeof setInterval> | null> = [];
    const timeouts: Array<ReturnType<typeof setTimeout> | null> = [];
    
    categories.forEach((cat, idx) => {
      const images = categoryImagesMap[cat.id] ?? [cat.image];
      if (images.length < 2) {
        intervals.push(null);
        timeouts.push(null);
        return;
      }
      // Map visual position (snake order) to delay: 100, 200, 300, 400, 500, 600, 700, 800
      const visualPosition = snakePattern.indexOf(idx);
      const offset = 100 + visualPosition * 100; // Offset in snake sequence
      const interval = 5000; // Base rotation interval
      
      // First rotation at offset time, then start interval
      const firstTimeout = setTimeout(() => {
        setActiveIndexes((prev) => {
          const next = [...prev];
          next[idx] = (next[idx] + 1) % images.length;
          return next;
        });
        
        // Then start interval from that point
        intervals[idx] = setInterval(() => {
          setActiveIndexes((prev) => {
            const next = [...prev];
            next[idx] = (next[idx] + 1) % images.length;
            return next;
          });
        }, interval);
      }, offset);
      
      timeouts.push(firstTimeout);
      intervals.push(null); // Will be set by setTimeout
    });
    
    return () => {
      intervals.forEach((timer) => {
        if (timer) clearInterval(timer);
      });
      timeouts.forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  const cardImages = useMemo(
    () =>
      categories.map((cat, idx) => {
        const list = categoryImagesMap[cat.id] ?? [cat.image];
        if (!list.length) return cat.image;
        const safeIndex = activeIndexes[idx] % list.length;
        return list[safeIndex];
      }),
    [activeIndexes]
  );

  return (
    <section id="products" className="py-24 md:py-32 px-6 bg-gradient-to-b from-background via-muted/20 to-background overflow-hidden relative">
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-light mb-4">Our Products</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Explore our collection of handcrafted textiles
          </p>
        </div>

        <div
          ref={containerRef}
          className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 perspective-1000"
          style={{
            transform: `rotateX(${mousePosition.y * 5}deg) rotateY(${mousePosition.x * 5}deg)`,
            transformStyle: "preserve-3d",
            transition: "transform 0.1s ease-out",
          }}
        >
          {categories.map((category, index) => {
            const depth = (index % 4) * 20;
            const floatDelay = index * 0.2;
            
            return (
              <Link
                key={category.id}
                to={`/category/${category.id}`}
                className="group relative"
                style={{
                  transform: `translateZ(${depth}px)`,
                  transformStyle: "preserve-3d",
                  animation: `float 3s ease-in-out ${floatDelay}s infinite`,
                }}
              >
                <div className="relative overflow-hidden rounded-2xl bg-card border-2 border-border/50 shadow-2xl transition-all duration-500 hover:border-accent hover:shadow-accent/20 hover:scale-105 hover:-translate-y-2">
                  {/* Product Image */}
                  <div
                    className="aspect-square overflow-hidden relative bg-card"
                    style={{ backgroundImage: `url(${cardImages[index] ?? category.image})`, backgroundSize: "cover", backgroundPosition: "center" }}
                  >
                    <AnimatePresence mode="sync" initial={false}>
                      <motion.img
                        key={cardImages[index] ?? category.image}
                        src={cardImages[index] ?? category.image}
                      alt={category.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 absolute inset-0"
                      loading="lazy"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.2, ease: "easeInOut" }}
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          if (target.src.endsWith(".jpg")) {
                            target.src = target.src.replace(".jpg", ".png");
                          } else {
                            target.src = baseImageMap[category.id] ?? category.image;
                          }
                        }}
                    />
                    </AnimatePresence>
                  </div>

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  {/* Content */}
                  <div className="p-6 relative z-10">
                    <h3 className="text-xl font-light mb-2 text-foreground group-hover:text-accent transition-colors duration-300">
                      {category.name}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {category.description}
                    </p>
                  </div>

                  {/* Shine effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  </div>
                </div>

                {/* Shadow effect */}
                <div
                  className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-primary/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ transform: `translateZ(-${depth}px)` }}
                />
              </Link>
            );
          })}
        </div>

      </div>

      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px) translateZ(var(--depth));
          }
          50% {
            transform: translateY(-20px) translateZ(var(--depth));
          }
        }
        
        .perspective-1000 {
          perspective: 1000px;
        }
      `}</style>
    </section>
  );
};
