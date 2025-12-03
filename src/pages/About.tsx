import { useEffect, useRef, useState } from 'react';

const About = () => {
  const [isVisible, setIsVisible] = useState({
    heading: false,
    description: false,
    grid: false
  });
  
  const headingRef = useRef(null);
  const descriptionRef = useRef(null);
  const gridRef = useRef(null);

  useEffect(() => {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observerCallback = (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const target = entry.target;
          if (target === headingRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, heading: true })), 100);
          } else if (target === descriptionRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, description: true })), 300);
          } else if (target === gridRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, grid: true })), 500);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    if (headingRef.current) observer.observe(headingRef.current);
    if (descriptionRef.current) observer.observe(descriptionRef.current);
    if (gridRef.current) observer.observe(gridRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="py-32 px-6">
        <div className="max-w-3xl mx-auto">
          <h1 
            ref={headingRef}
            className={`text-5xl md:text-7xl font-light mb-12 transition-all duration-1000 ${
              isVisible.heading 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-8'
            }`}
          >
            About
          </h1>
          
          <p 
            ref={descriptionRef}
            className={`text-2xl text-slate-700 leading-relaxed mb-12 font-light transition-all duration-1000 ${
              isVisible.description 
                ? 'opacity-100 translate-y-0' 
                : 'opacity-0 translate-y-8'
            }`}
          >
            Manufacturing-led home textile company serving global retailers with export-grade quality and consistent delivery.
          </p>
          
          <div 
            ref={gridRef}
            className="grid grid-cols-2 gap-x-16 gap-y-8 text-lg text-slate-600"
          >
            {[
              'Export-focused',
              'Natural fiber-based products',
              'US & international markets',
              'B2B partnerships'
            ].map((text, index) => (
              <div
                key={index}
                className={`transition-all duration-700 ${
                  isVisible.grid 
                    ? 'opacity-100 translate-x-0' 
                    : 'opacity-0 -translate-x-4'
                }`}
                style={{ 
                  transitionDelay: isVisible.grid ? `${index * 100}ms` : '0ms' 
                }}
              >
                <div className="group cursor-default">
                  <p className="font-light relative inline-block">
                    {text}
                    <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-slate-700 transition-all duration-300 group-hover:w-full"></span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;