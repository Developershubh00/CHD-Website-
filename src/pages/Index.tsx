import { Hero, HeroCarousel } from "@/components/Hero";
import { ProductCategoriesSpatial } from "@/components/ProductCategoriesSpatial";
import { QualitySection } from "@/components/QualitySection";
import { ComplianceSection } from "@/components/ComplianceSection";
import { CertificateSection } from "@/components/CertificateSection";
import ContactSection from "@/components/ContactSection";

const Index = () => {
  return (
    <div id="top" className="min-h-screen">
      <Hero />
      <div className="space-y-0">
        <section>
          <div className="px-6 pt-8 text-center mt-16">
            <h2 className="text-4xl md:text-6xl font-light mb-4">
              About Us
            </h2>
          </div>
          <div id="about-us">
            <HeroCarousel />
          </div>
        </section>
        <ProductCategoriesSpatial />
        {/* <ImageGallery /> */}
        <QualitySection />
        <CertificateSection />
        <ComplianceSection />
        <ContactSection />
      </div>
    </div>
  );
};

export default Index;
