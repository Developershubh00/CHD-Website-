import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

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
  const playerRef = useRef<HTMLVideoElement>(null);
  const [soundOn, setSoundOn] = useState(false);

  // The film autoplays muted; sound is opt-in and switches off again once the video scrolls out of view.
  const toggleSound = () => {
    const video = playerRef.current;
    if (!video) return;
    const next = !soundOn;
    video.muted = !next;
    if (next) video.play().catch(() => {});
    setSoundOn(next);
  };

  useEffect(() => {
    const video = playerRef.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting && !video.muted) {
        video.muted = true;
        setSoundOn(false);
      }
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

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
              Materials are checked at intake, production is inspected on the
              floor, and every finished piece is measured against the approved
              sample — so the quality you approve is the quality that arrives.
            </p>
          </div>
        </div>

        {/* Quality Management Video */}
        <div
          ref={videoRef}
          className={`relative transition-all duration-1000 overflow-hidden rounded-2xl md:rounded-3xl ${
            isVisible.video
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-8'
          }`}
        >
          <video
            ref={playerRef}
            className="w-full h-auto rounded-2xl md:rounded-3xl"
            src="/QualityManagement.mp4"
            poster="/QualityManagement-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
          />
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 md:bottom-5 md:right-5 flex items-center justify-center gap-2 h-8 w-8 sm:h-9 sm:w-auto sm:px-3 md:h-10 md:px-4 rounded-full bg-background/85 backdrop-blur-sm text-foreground/80 text-xs md:text-sm font-light tracking-wide shadow-sm ring-1 ring-foreground/10 transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {soundOn ? <Volume2 className="w-4 h-4" aria-hidden="true" /> : <VolumeX className="w-4 h-4" aria-hidden="true" />}
            <span className="sr-only sm:not-sr-only">Sound</span>
          </button>
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
