import { useEffect, useRef, useState } from 'react';
import sedexLogo from "@/assets/sedex-logo.png";
import textilePatternBg from "@/assets/textile-pattern-bg.jpg";

export const ComplianceSection = () => {
  const [isVisible, setIsVisible] = useState({
    heading: false,
    content: false
  });
  
  const headingRef = useRef(null);
  const contentRef = useRef(null);

  useEffect(() => {
    const observerOptions = {
      threshold: 0.15,
      rootMargin: '0px 0px -80px 0px'
    };

    const observerCallback = (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = entry.target;
          if (target === headingRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, heading: true })), 100);
          } else if (target === contentRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, content: true })), 300);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    if (headingRef.current) observer.observe(headingRef.current);
    if (contentRef.current) observer.observe(contentRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-20 md:py-28 px-6 bg-background">
      <div className="max-w-3xl mx-auto">
        <h2 
          ref={headingRef}
          className={`text-4xl md:text-6xl font-light mb-16 text-center transition-all duration-1000 ${
            isVisible.heading 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-8'
          }`}
        >
          Compliance
        </h2>
        
        <div 
          ref={contentRef}
          className={`relative overflow-hidden rounded-xl transition-all duration-1000 ${
            isVisible.content 
              ? 'opacity-100 scale-100' 
              : 'opacity-0 scale-95'
          }`}
        >
          {/* Background image with overlay */}
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-60"
            style={{ backgroundImage: `url(${textilePatternBg})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/30 to-background/40" />
          
          {/* Content */}
          <div className="relative z-10 py-16">
            <div className="flex justify-center items-center">
              <a
                href="#" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex flex-col items-center gap-4 transition-all duration-700 hover:scale-110 cursor-pointer group"
                title="View SEDEX 4 Pillar SMETA Certificate"
              >
                <div className="relative">
                  <img 
                    src={sedexLogo} 
                    alt="SEDEX 4 Pillar SMETA Certification" 
                    className="h-32 w-auto object-contain transition-all duration-300 group-hover:drop-shadow-xl"
                  />
                  <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 rounded-lg transition-all duration-300"></div>
                </div>
                <p className="text-sm text-muted-foreground text-center group-hover:text-foreground transition-colors font-light">
                  SEDEX 4 Pillar SMETA
                </p>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

