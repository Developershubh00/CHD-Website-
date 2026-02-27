import { Hero, HeroCarousel } from "@/components/Hero";
import { ProductCategoriesSpatial } from "@/components/ProductCategoriesSpatial";
import { QualitySection } from "@/components/QualitySection";
import { ComplianceSection } from "@/components/ComplianceSection";
import { CertificateSection } from "@/components/CertificateSection";
import ContactSection from "@/components/ContactSection";

const Index = () => {
  return (
    <div id="top" className="min-h-screen">
      <div className="md:-ml-20 md:w-[calc(100%+5rem)]">
        <Hero />
      </div>
      <div className="space-y-0">
        <section>
          {/* <div className="px-6 pt-8 text-center mt-16">
            
          </div> */}
          <div id="about-us">
            <HeroCarousel
              overlayContent={
                <div className="space-y-4">
                  <h2 className="text-3xl sm:text-4xl md:text-6xl font-light mb-1">
                    About Us
                  </h2>
                  <p>
                    Creative Home Decor is a B2B, export-focused home-textile manufacturer serving global retailers and sourcing teams and leading buyers. It's built on a simple approach: do our work with care and deliver what we promise. We design and produce everyday home textiles—placemats, table runners, rugs, bathmats, bedding, and cushions—with attention to detail and a steady commitment to consistency.
                  </p>
                  <p>
                    Our team has spent years understanding how good products come to life. We keep our processes straightforward, stay honest about what we can deliver, and focus on meeting timelines without compromises. Buyers work with us because they prefer reliability over noise, and that is where we place our energy.
                  </p>
                  <p>
                    We prefer to listen, understand what a customer actually needs, and then build the order step by step with clear communication and predictable execution. The goal is simple: make it easy for our customers to work with us and feel confident in the outcome.
                  </p>
                  <p>
                    Creative Home Decor continues to grow through long-term relationships shaped by trust, consistent quality, and a calm, steady way of working.
                  </p>
                </div>
              }
            />
          </div>
        </section>
        <ProductCategoriesSpatial />
        {/* <ImageGallery /> */}
        <QualitySection />
        
        <ComplianceSection />
        <ContactSection />
      </div>
    </div>
  );
};

export default Index;
