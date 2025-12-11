// import { useEffect, useRef, useState } from 'react';

// const About = () => {
//   const [isVisible, setIsVisible] = useState({
//     heading: false,
//     description: false,
//     grid: false
//   });
  
//   const headingRef = useRef(null);
//   const descriptionRef = useRef(null);
//   const gridRef = useRef(null);

//   useEffect(() => {
//     const observerOptions = {
//       threshold: 0.1,
//       rootMargin: '0px 0px -50px 0px'
//     };

//     const observerCallback = (entries) => {
//       entries.forEach(entry => {
//         if (entry.isIntersecting) {
//           const target = entry.target;
//           if (target === headingRef.current) {
//             setTimeout(() => setIsVisible(prev => ({ ...prev, heading: true })), 100);
//           } else if (target === descriptionRef.current) {
//             setTimeout(() => setIsVisible(prev => ({ ...prev, description: true })), 300);
//           } else if (target === gridRef.current) {
//             setTimeout(() => setIsVisible(prev => ({ ...prev, grid: true })), 500);
//           }
//         }
//       });
//     };

//     const observer = new IntersectionObserver(observerCallback, observerOptions);

//     if (headingRef.current) observer.observe(headingRef.current);
//     if (descriptionRef.current) observer.observe(descriptionRef.current);
//     if (gridRef.current) observer.observe(gridRef.current);

//     return () => observer.disconnect();
//   }, []);

//   return (
//     <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
//       <div className="py-32 px-6">
//         <div className="max-w-3xl mx-auto">
//           <h1 
//             ref={headingRef}
//             className={`text-5xl md:text-7xl font-light mb-12 transition-all duration-1000 ${
//               isVisible.heading 
//                 ? 'opacity-100 translate-y-0' 
//                 : 'opacity-0 translate-y-8'
//             }`}
//           >
//             About
//           </h1>
          
//           <p 
//             ref={descriptionRef}
//             className={`text-2xl text-slate-700 leading-relaxed mb-12 font-light transition-all duration-1000 ${
//               isVisible.description 
//                 ? 'opacity-100 translate-y-0' 
//                 : 'opacity-0 translate-y-8'
//             }`}
//           >
//             Manufacturing-led home textile company serving global retailers with export-grade quality and consistent delivery.
//           </p>
          
//           <div 
//             ref={gridRef}
//             className="grid grid-cols-2 gap-x-16 gap-y-8 text-lg text-slate-600"
//           >
//             {[
//               'Export-focused',
//               'Natural fiber-based products',
//               'US & international markets',
//               'B2B partnerships'
//             ].map((text, index) => (
//               <div
//                 key={index}
//                 className={`transition-all duration-700 ${
//                   isVisible.grid 
//                     ? 'opacity-100 translate-x-0' 
//                     : 'opacity-0 -translate-x-4'
//                 }`}
//                 style={{ 
//                   transitionDelay: isVisible.grid ? `${index * 100}ms` : '0ms' 
//                 }}
//               >
//                 <div className="group cursor-default">
//                   <p className="font-light relative inline-block">
//                     {text}
//                     <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-slate-700 transition-all duration-300 group-hover:w-full"></span>
//                   </p>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default About;

import { useEffect, useRef, useState } from 'react';

const About = () => {
  const [isVisible, setIsVisible] = useState({
    heading: false,
    description: false,
    content: false
  });
  
  const headingRef = useRef(null);
  const descriptionRef = useRef(null);
  const contentRef = useRef(null);

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
          } else if (target === contentRef.current) {
            setTimeout(() => setIsVisible(prev => ({ ...prev, content: true })), 500);
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    if (headingRef.current) observer.observe(headingRef.current);
    if (descriptionRef.current) observer.observe(descriptionRef.current);
    if (contentRef.current) observer.observe(contentRef.current);

    return () => observer.disconnect();
  }, []);

  const paragraphs = [
    "Creative Home Decor is a B2B, export-focused home-textile manufacturer serving global retailers and sourcing teams and leading buyers. It's built on a simple approach: do our work with care and deliver what we promise. We design and produce everyday home textiles—placemats, table runners, rugs, bathmats, bedding, and cushions—with attention to detail and a steady commitment to consistency.",
    "Our team has spent years understanding how good products come to life. We keep our processes straightforward, stay honest about what we can deliver, and focus on meeting timelines without compromises. Buyers work with us because they prefer reliability over noise, and that is where we place our energy.",
    "We prefer to listen, understand what a customer actually needs, and then build the order step by step with clear communication and predictable execution. The goal is simple: make it easy for our customers to work with us and feel confident in the outcome.",
    "Creative Home Decor continues to grow through long-term relationships shaped by trust, consistent quality, and a calm, steady way of working."
  ];

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
            About Us
          </h1>
          
          <div 
            ref={contentRef}
            className="space-y-6 text-lg text-slate-700 leading-relaxed font-light"
          >
            {paragraphs.map((text, index) => (
              <p
                key={index}
                className={`transition-all duration-1000 ${
                  isVisible.content 
                    ? 'opacity-100 translate-y-0' 
                    : 'opacity-0 translate-y-8'
                }`}
                style={{ 
                  transitionDelay: isVisible.content ? `${index * 200}ms` : '0ms' 
                }}
              >
                {text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;