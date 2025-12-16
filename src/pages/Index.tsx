import { Hero } from "@/components/Hero";
import { ProductCategoriesSpatial } from "@/components/ProductCategoriesSpatial";
import { QualitySection } from "@/components/QualitySection";
import { ComplianceSection } from "@/components/ComplianceSection";
import { CertificateSection } from "@/components/CertificateSection";
import AboutSection from "@/components/AboutSection";
import ContactSection from "@/components/ContactSection";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Hero />
      <div className="space-y-0">
        <ProductCategoriesSpatial />
        {/* <ImageGallery /> */}
        <QualitySection />
        <ComplianceSection />
        <CertificateSection />
        <AboutSection />
        <ContactSection />
      </div>
    </div>
  );
};

export default Index;
