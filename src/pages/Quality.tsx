import { QualitySection } from "@/components/QualitySection";
import { usePageMeta } from "@/hooks/use-page-meta";

const Quality = () => {
  usePageMeta(
    "Quality",
    "Quality management system with clear quality checks and control measures from sampling to dispatch."
  );

  return (
    <div className="min-h-screen">
      <QualitySection />
    </div>
  );
};

export default Quality;
