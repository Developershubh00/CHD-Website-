import { ReactNode, useEffect, useState } from "react";
import heroLifestyleFinal from "@/assets/hero-lifestyle-final.jpg";
import heroRug from "@/assets/hero-rug-striped.jpg";
import heroBedding from "@/assets/hero-bedding.jpg";
import heroPlacemat from "@/assets/hero-placemat.jpg";
import heroBathmat from "@/assets/hero-bathmat.jpg";
import heroRunner from "@/assets/hero-runner.jpg";

export const Hero = () => {
  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden">
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="/CHD-intro.mp4"
        autoPlay
        muted
        loop
        playsInline
      />
    </section>
  );
};

export const HeroCarousel = ({ overlayContent }: { overlayContent?: ReactNode }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const heroImages = [
    heroLifestyleFinal,
    heroRug,
    heroBedding,
    heroPlacemat,
    heroBathmat,
    heroRunner,
  ];

  // Auto-advance slides every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % heroImages.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [heroImages.length]);

  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden">
      {/* Hero carousel images */}
      {heroImages.map((image, index) => (
        <div
          key={index}
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 z-[1] ${
            index === currentImageIndex ? "opacity-100" : "opacity-0"
          }`}
          style={{
            backgroundImage: `url(${image})`,
          }}
        />
      ))}

      {/* Dark overlay for text legibility */}
      <div className="absolute inset-0 bg-black/30 pointer-events-none z-[2]" />

      {overlayContent && (
        <div className="absolute inset-0 z-[3] flex items-center justify-center px-6">
          <div className="max-w-3xl mx-auto text-center text-white text-lg md:text-xl leading-relaxed font-light drop-shadow-2xl">
            {overlayContent}
          </div>
        </div>
      )}

      {/* Slide indicators */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 flex gap-2">
        {heroImages.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentImageIndex(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentImageIndex
                ? "bg-white w-8 shadow-lg"
                : "bg-white/40 hover:bg-white/60"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </section>
  );
};
