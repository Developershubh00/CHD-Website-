// import { Link } from "react-router-dom";
// import rugImage from "@/assets/product-rug.png";
// import placematImage from "@/assets/product-placemat.png";
// import runnerImage from "@/assets/product-runner.png";
// import cushionImage from "@/assets/product-cushion.jpg";
// import throwImage from "@/assets/product-throw.jpg";
// import beddingImage from "@/assets/product-bedding.jpg";
// import bathmatImage from "@/assets/product-bathmat.jpg";
// import chairpadImage from "@/assets/product-chairpad.jpg";

// const categories = [
//   {
//     id: "rugs",
//     name: "Rugs",
//     image: rugImage,
//     description: "Handwoven rugs for every space",
//   },
//   {
//     id: "placemats",
//     name: "Placemats",
//     image: placematImage,
//     description: "Elegant table settings for dining",
//   },
//   {
//     id: "runners",
//     name: "Table Runners",
//     image: runnerImage,
//     description: "Beautiful runners for your tables",
//   },
//   {
//     id: "cushions",
//     name: "Cushions",
//     image: cushionImage,
//     description: "Comfortable cushions",
//   },
//   {
//     id: "throws",
//     name: "Throws",
//     image: throwImage,
//     description: "Soft throws and blankets",
//   },
//   {
//     id: "bedding",
//     name: "Premium Bedding",
//     image: beddingImage,
//     description: "Luxury bedding collections",
//   },
//   {
//     id: "bathmats",
//     name: "Bath Mats",
//     image: bathmatImage,
//     description: "Spa-quality bath mats",
//   },
//   {
//     id: "chairpads",
//     name: "Chair Pads",
//     image: chairpadImage,
//     description: "Comfortable seating solutions",
//   },
// ];

// export const ProductCategories = () => {
//   return (
//     <section id="products" className="py-32 px-6 bg-muted/30">
//       <div className="max-w-7xl mx-auto">
//         <div className="text-center mb-16">
//           <h2 className="text-4xl md:text-6xl font-light mb-4">Our Products</h2>
//           <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
//             Explore our collection of handcrafted textiles, primarily natural fibers with limited polyester
//           </p>
//         </div>

//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
//           {categories.map((category) => (
//             <Link
//               key={category.id}
//               to={`/category/${category.id}`}
//               className="group relative overflow-hidden bg-card border border-border transition-all hover:border-accent hover:shadow-lg"
//             >
//               <div className="aspect-square overflow-hidden">
//                 <img
//                   src={category.image}
//                   alt={category.name}
//                   className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
//                 />
//               </div>
//               <div className="p-6">
//                 <h3 className="text-xl font-light mb-2 text-foreground group-hover:text-accent transition-colors">
//                   {category.name}
//                 </h3>
//                 <p className="text-sm text-muted-foreground">{category.description}</p>
//               </div>
//             </Link>
//           ))}
//         </div>
//       </div>
//     </section>
//   );
// };
import { useEffect, useMemo, useState } from "react";
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

// Precompute a small set of public image URLs per category (up to 6).
// We'll always include the base image first to guarantee at least one valid source.
const categoryImagesMap: Record<string, string[]> = {
  rugs: [
    baseImageMap.rugs,
    ...Array.from({ length: 6 }, (_, i) => `/images/rugs/slide_${String(i + 1).padStart(3, "0")}/image_01.jpg`),
  ],
  placemats: [
    baseImageMap.placemats,
    ...Array.from({ length: 6 }, (_, i) => `/images/placemat/slide_${String(i + 1).padStart(3, "0")}/image_01.jpg`),
  ],
  runners: [
    baseImageMap.runners,
    ...Array.from({ length: 6 }, (_, i) => `/images/TableRunner/slide_${String(i + 1).padStart(3, "0")}/image_01.jpg`),
  ],
  cushions: [
    baseImageMap.cushions,
    ...Array.from({ length: 6 }, (_, i) => `/images/cushion/slide_${String(i + 1).padStart(3, "0")}/image_01.jpg`),
  ],
  throws: [
    baseImageMap.throws,
    ...Array.from({ length: 6 }, (_, i) => `/images/throw/slide_${String(i + 1).padStart(3, "0")}/image_01.jpg`),
  ],
  bedding: [
    baseImageMap.bedding,
    ...Array.from({ length: 6 }, (_, i) => `/images/bedding/slide_${String(i + 1).padStart(3, "0")}/image_01.jpg`),
  ],
  // No public images for bathmats/chairpads in /public/images; keep base only
  bathmats: [baseImageMap.bathmats],
  chairpads: [baseImageMap.chairpads],
};

// Column-based staggered intervals (slower/smoother): col1+5 =>5.0s, col2+6 =>6.2s, col3+7=>7.4s, col4+8=>5.6s
const intervalPattern = [5000, 6200, 7400, 5600];

export const ProductCategories = () => {
  const [activeIndexes, setActiveIndexes] = useState<number[]>(() => categories.map(() => 0));

  // Staggered intervals per column
  useEffect(() => {
    const timers = categories.map((cat, idx) => {
      const interval = intervalPattern[idx % intervalPattern.length];
      const images = categoryImagesMap[cat.id] ?? [cat.image];
      if (images.length < 2) return null; // no need to rotate if only one image
      const startDelay = 800 + (idx % 4) * 300;
      const timer = setInterval(() => {
        setActiveIndexes((prev) => {
          const next = [...prev];
          next[idx] = (next[idx] + 1) % images.length;
          return next;
        });
      }, interval);
      const kick = setTimeout(() => {
        setActiveIndexes((prev) => {
          const next = [...prev];
          next[idx] = (next[idx] + 1) % images.length;
          return next;
        });
      }, startDelay);
      return [timer, kick];
    });
    return () =>
      timers.forEach((pair) => {
        if (!pair) return;
        const [timer, kick] = pair as unknown as Array<ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>>;
        if (timer) clearInterval(timer as ReturnType<typeof setInterval>);
        if (kick) clearTimeout(kick as ReturnType<typeof setTimeout>);
      });
  }, []);

  // Compute the image to show for each card
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
    <section id="products" className="py-24 md:py-32 px-6 bg-gradient-to-b from-background via-muted/20 to-background">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-light mb-4">Our Products</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Explore our collection of handcrafted textiles, primarily natural fibers with limited polyester
          </p>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {categories.map((category, index) => (
            <Link
              key={category.id}
              to={`/category/${category.id}`}
              className="group relative overflow-hidden rounded-2xl bg-card border-2 border-border/50 shadow-lg transition-all duration-500 hover:border-accent hover:shadow-2xl hover:shadow-accent/20 hover:-translate-y-2"
              style={{
                animation: `fadeInUp 0.6s ease-out ${index * 0.1}s both`
              }}
            >
              {/* Product Image */}
              <div
                className="aspect-square overflow-hidden relative"
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
                
                {/* Gradient Overlay on Hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>

              {/* Content */}
              <div className="p-6 relative">
                <h3 className="text-xl font-light mb-2 text-foreground group-hover:text-accent transition-colors duration-300">
                  {category.name}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {category.description}
                </p>
                
                {/* View Details Link */}
                <div className="flex items-center text-sm text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <span>View Details</span>
                  <svg className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* Shine Effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              </div>
            </Link>
          ))}
        </div>

        {/* CTA Section */}
        <div className="mt-20 text-center">
          <p className="text-muted-foreground mb-6">
            Can't find what you're looking for?
          </p>
          <Link
            to="/contact"
            className="inline-block bg-accent text-accent-foreground hover:bg-accent/90 px-8 py-4 rounded-lg text-lg font-medium transition-all hover:scale-105 active:scale-95"
          >
            Request Custom Product
          </Link>
        </div>
      </div>

      {/* Animation Keyframes */}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
};