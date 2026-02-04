// CHD lifestyle images for product cards (homepage + products page). Base path: public/chd/
const CHD_FOLDERS: Record<string, string> = {
  rugs: "rugsgen",
  placemats: "placematgen",
  runners: "tablerunnergen",
  cushions: "cushiongen",
  throws: "throwgen",
  bedding: "beddinggen",
  bathmats: "bathmatgen",
  chairpads: "totegen",
};
const MAX_SLIDES = 200;

export function getProductCardImages(
  categoryId: string,
  fallbackImage: string
): string[] {
  const folder = CHD_FOLDERS[categoryId];
  if (!folder) return [fallbackImage];
  return [
    fallbackImage,
    ...Array.from({ length: MAX_SLIDES }, (_, i) =>
      `/chd/${folder}/slide_${String(i + 1).padStart(3, "0")}/lifestyle.png`
    ),
  ];
}
