import { useState, useEffect, useRef } from "react";
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

export const ProductCategoriesSpatial = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
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
                  <div className="aspect-square overflow-hidden">
                    <img
                      src={category.image}
                      alt={category.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
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
