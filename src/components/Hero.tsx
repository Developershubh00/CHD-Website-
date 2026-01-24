import { useEffect, useState } from "react";
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

export const HeroCarousel = () => {
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
      <div className="absolute inset-0 bg-black/20 pointer-events-none z-[2]" />

      {/* Content overlay with text */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center flex flex-col items-center justify-center min-h-screen">
        <h1 className="font-playfair text-6xl md:text-8xl font-light tracking-wider text-white drop-shadow-2xl mb-4 animate-fade-in">
          creative home decor
        </h1>
        <p className="font-playfair text-2xl md:text-3xl tracking-widest text-white drop-shadow-lg uppercase animate-fade-in-delay">
          crafting trust
        </p>
      </div>

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
