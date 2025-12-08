const products = [
  "Rugs",
  "Placemats",
  "Table Runners",
  "Cushions",
  "Bath Mats",
  "Premium Bedding",
  "Throws",
  "Bed Pads",
  "Tote Bags",
];

export const ProductGrid = () => {
  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-light mb-4 text-center">
          Product Categories
        </h2>
        <p className="text-muted-foreground text-center mb-16 max-w-2xl mx-auto">
          Primarily natural fibers; limited polyester.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <div
              key={product}
              className="group bg-card border border-border p-8 hover:border-accent transition-colors duration-300"
            >
              <h3 className="text-xl font-light text-foreground group-hover:text-accent transition-colors">
                {product}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
