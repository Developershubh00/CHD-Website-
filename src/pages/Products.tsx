import { ProductCategories } from "@/components/ProductCategories";
import { usePageMeta } from "@/hooks/use-page-meta";

const Products = () => {
  usePageMeta(
    "Products",
    "Browse our home textile collections: rugs, placemats, table runners, cushions, throws, bedding, bath mats, and tote bags."
  );

  return (
    <div className="min-h-screen">
      <ProductCategories />
    </div>
  );
};

export default Products;
