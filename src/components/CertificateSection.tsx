import { useEffect, useRef, useState } from 'react';
import oekotexLogo from "@/assets/oekotex-logo.png";
import iso9001Logo from "@/assets/iso-9001-official.png";
import iso14001Logo from "@/assets/iso-14001-official.png";
import iso45001Logo from "@/assets/iso-45001-official.png";
import textilePatternBg from "@/assets/textile-pattern-bg.jpg";

export const CertificateSection = () => {
  const [isVisible, setIsVisible] = useState({
    heading: false,
    oekotex: false,
    isoCerts: false
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
            setTimeout(() => {
              setIsVisible(prev => ({ ...prev, oekotex: true }));
              setTimeout(() => setIsVisible(prev => ({ ...prev, isoCerts: true })), 400);
            }, 300);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    if (headingRef.current) observer.observe(headingRef.current);
    if (contentRef.current) observer.observe(contentRef.current);

    return () => observer.disconnect();
  }, []);

  const isoCertifications = [
    { 
      logo: iso9001Logo, 
      alt: "ISO 9001:2015 Quality Management Certification", 
      title: "ISO 9001:2015",
      description: "View ISO 9001:2015 Certificate"
    },
    { 
      logo: iso14001Logo, 
      alt: "ISO 14001:2015 Environmental Management Certification", 
      title: "ISO 14001:2015",
      description: "View ISO 14001:2015 Certificate"
    },
    { 
      logo: iso45001Logo, 
      alt: "ISO 45001:2018 Occupational Health & Safety Certification", 
      title: "ISO 45001:2018",
      description: "View ISO 45001:2018 Certificate"
    }
  ];

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
          Certificates
        </h2>
        
        <div 
          ref={contentRef}
          className={`relative overflow-hidden rounded-xl transition-all duration-1000 ${
            isVisible.oekotex || isVisible.isoCerts
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
            {/* OEKO-TEX */}
            <div className="flex justify-center items-center mb-12">
              <a
                href="#" 
                target="_blank" 
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-4 transition-all duration-700 hover:scale-110 cursor-pointer group ${
                  isVisible.oekotex 
                    ? 'opacity-100 translate-y-0' 
                    : 'opacity-0 translate-y-8'
                }`}
                title="View OEKO-TEX Standard 100 Certificate"
              >
                <div className="relative">
                  <img 
                    src={oekotexLogo} 
                    alt="OEKO-TEX Standard 100 Certification" 
                    className="h-32 w-auto object-contain transition-all duration-300 group-hover:drop-shadow-xl"
                  />
                  <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 rounded-lg transition-all duration-300"></div>
                </div>
                <p className="text-sm text-muted-foreground text-center group-hover:text-foreground transition-colors font-light">
                  OEKO-TEX Standard 100
                </p>
              </a>
            </div>

            {/* ISO Certifications */}
            <div className="flex justify-center items-center gap-8 flex-wrap">
              {isoCertifications.map((cert, index) => (
                <a
                  key={index}
                  href="#" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`flex flex-col items-center gap-4 transition-all duration-700 hover:scale-110 cursor-pointer group ${
                    isVisible.isoCerts 
                      ? 'opacity-100 translate-y-0' 
                      : 'opacity-0 translate-y-8'
                  }`}
                  style={{ 
                    transitionDelay: isVisible.isoCerts ? `${index * 150}ms` : '0ms' 
                  }}
                  title={cert.description}
                >
                  <div className="relative">
                    <img 
                      src={cert.logo} 
                      alt={cert.alt} 
                      className="h-28 w-auto object-contain transition-all duration-300 group-hover:drop-shadow-xl"
                    />
                    <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 rounded-lg transition-all duration-300"></div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center group-hover:text-foreground transition-colors font-light">
                    {cert.title}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

