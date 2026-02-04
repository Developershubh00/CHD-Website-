import { ReactNode, useEffect, useRef, useState } from "react";
import heroLifestyleFinal from "@/assets/hero-lifestyle-final.jpg";
import heroRug from "@/assets/hero-rug-striped.jpg";
import heroBedding from "@/assets/hero-bedding.jpg";
import heroPlacemat from "@/assets/hero-placemat.jpg";
import heroBathmat from "@/assets/hero-bathmat.jpg";
import heroRunner from "@/assets/hero-runner.jpg";

export const Hero = () => {
  return (
    <section className="relative w-full overflow-hidden md:h-screen md:flex md:items-center md:justify-center">
      <video
        className="w-full h-auto md:absolute md:inset-0 md:h-full md:w-full object-cover"
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

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

  useEffect(() => {
    const updateHint = () => {
      const el = scrollRef.current;
      if (!el) return;
      const isScrollable = el.scrollHeight > el.clientHeight + 4;
      setShowScrollHint(isScrollable && el.scrollTop < 10);
    };

    updateHint();
    window.addEventListener("resize", updateHint);
    return () => window.removeEventListener("resize", updateHint);
  }, [overlayContent]);

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
        <div className="absolute inset-0 z-[3] flex items-center justify-center px-4 sm:px-6 py-16 sm:py-6">
          <div className="w-full sm:max-w-3xl mx-auto rounded-2xl sm:rounded-none bg-black/25 sm:bg-transparent backdrop-blur-[2px] sm:backdrop-blur-0">
            <div
              ref={scrollRef}
              onScroll={() => {
                const el = scrollRef.current;
                if (!el) return;
                if (el.scrollTop > 10) setShowScrollHint(false);
              }}
              className="relative max-h-[80vh] sm:max-h-none overflow-y-auto sm:overflow-visible p-4 sm:p-0"
            >
              <div className="text-left sm:text-center text-white text-[15px] sm:text-lg md:text-xl leading-relaxed font-light drop-shadow-2xl">
                {overlayContent}
              </div>
            </div>

            {showScrollHint && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 sm:hidden pointer-events-none z-10">
                <div className="px-4 py-1.5 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs font-semibold tracking-widest uppercase shadow-lg ring-1 ring-white/20 animate-bounce">
                  Scroll ↓
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide indicators */}
      <div className="absolute bottom-5 sm:bottom-8 left-1/2 transform -translate-x-1/2 z-10 flex gap-2">
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
