import { useEffect, useRef, useState } from 'react';

const AboutSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  return (
    <section ref={sectionRef} className="py-20 md:py-28 px-6 bg-background">
      <div className="max-w-3xl mx-auto">
        <h2 
          className={`text-5xl md:text-7xl font-light mb-12 transition-all duration-1000 ${
            isVisible 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-8'
          }`}
        >
          About Us
        </h2>
        
        <div className="space-y-6 text-lg text-foreground/90 leading-relaxed font-light">
          <p
            className={`transition-all duration-1000 delay-200 ${
              isVisible 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-8'
            }`}
          >
            Creative Home Décor is a B2B, export-focused home-textile manufacturer serving global retailers and sourcing teams and leading buyers. It's built on a simple approach: do our work with care and deliver what we promise. We design and produce everyday home textiles—placemats, table runners, rugs, bathmats, bedding, and cushions—with attention to detail and a steady commitment to consistency.
          </p>
          
          <p
            className={`transition-all duration-1000 delay-400 ${
              isVisible 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-8'
            }`}
          >
            Our team has spent years understanding how good products come to life. We keep our processes straightforward, stay honest about what we can deliver, and focus on meeting timelines without compromises. Buyers work with us because they prefer reliability over noise, and that is where we place our energy.
          </p>
          
          <p
            className={`transition-all duration-1000 delay-600 ${
              isVisible 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-8'
            }`}
          >
            We prefer to listen, understand what a customer actually needs, and then build the order step by step with clear communication and predictable execution. The goal is simple: make it easy for our customers to work with us and feel confident in the outcome.
          </p>
          
          <p
            className={`transition-all duration-1000 delay-700 ${
              isVisible 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-8'
            }`}
          >
            Creative Home Décor continues to grow through long-term relationships shaped by trust, consistent quality, and a calm, steady way of working.
          </p>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;