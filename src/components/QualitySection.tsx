import { useEffect, useRef, useState } from 'react';

export const QualitySection = () => {
  const [isVisible, setIsVisible] = useState({
    heading: false,
    description: false,
    video: false,
    features: false
  });

  const headingRef = useRef(null);
  const descriptionRef = useRef(null);
  const videoRef = useRef(null);
  const featuresRef = useRef(null);

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
          } else if (target === descriptionRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, description: true })), 300);
          } else if (target === videoRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, video: true })), 200);
          } else if (target === featuresRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, features: true })), 500);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    if (headingRef.current) observer.observe(headingRef.current);
    if (descriptionRef.current) observer.observe(descriptionRef.current);
    if (videoRef.current) observer.observe(videoRef.current);
    if (featuresRef.current) observer.observe(featuresRef.current);

    return () => observer.disconnect();
  }, []);

  const features = [
    { title: "Inspection", description: "Every stage" },
    { title: "Timelines", description: "Consistent delivery" },
    { title: "Standards", description: "Export-grade" }
  ];

  return (
    <section className="py-12 md:py-28 px-6 bg-background">
      <div className="max-w-5xl mx-auto">
        <div className="max-w-3xl mx-auto">
          <h2
            ref={headingRef}
            className={`text-4xl md:text-6xl font-light mb-8 text-center transition-all duration-1000 ${
              isVisible.heading
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-8'
            }`}
          >
            Quality Management System
          </h2>

          <div
            ref={descriptionRef}
            className={`mb-16 space-y-6 transition-all duration-1000 ${
              isVisible.description
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-8'
            }`}
          >
            <p className="text-xl text-foreground leading-relaxed font-light text-center">
              Clear quality checks and control measures from sampling to dispatch.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed font-light text-center">
              Every order moves through the same disciplined path. Yarns and raw
              materials are checked at intake, weaving and stitching are inspected
              on the floor while production runs, and each finished piece is
              measured against the approved sample before it is packed.
            </p>
            <p className="text-lg text-muted-foreground leading-relaxed font-light text-center">
              The same standards apply to every order, first shipment or repeat
              program — so the quality our buyers approve is the quality that
              arrives, container after container.
            </p>
          </div>
        </div>

        {/* Quality Management Video */}
        <div
          ref={videoRef}
          className={`transition-all duration-1000 overflow-hidden rounded-2xl md:rounded-3xl ${
            isVisible.video
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-8'
          }`}
        >
          <video
            className="w-full h-auto rounded-2xl md:rounded-3xl"
            src="/QualityManagement.mp4"
            poster="/QualityManagement-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>

        <div ref={featuresRef} className="grid md:grid-cols-3 gap-12 mt-16">
          {features.map((feature, index) => (
            <div
              key={index}
              className={`text-center transition-all duration-700 ${
                isVisible.features
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-6'
              }`}
              style={{
                transitionDelay: isVisible.features ? `${index * 150}ms` : '0ms'
              }}
            >
              <div className="group cursor-default">
                <h3 className="text-xl font-light mb-3 transition-colors group-hover:text-blue-600">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
