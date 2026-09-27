import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_DIRS, cardImageUrl, shuffle, slideNumbers } from "@/lib/catalog";

type CardCategory = { id: string; image: string };

// Each category card tours its own category's whole library in a fresh random
// order on every page load, so repeat visitors keep meeting designs they have
// not seen, and no card ever shows another category's design.
const STAGGER_MS = 400;
const WAVE_INTERVAL_MS = 6000;
// Snake pattern for the 4-column grid: top row left->right, bottom row right->left
const snakePattern = [0, 1, 2, 3, 7, 6, 5, 4];

/** The image each card shows right now; falls back to the category cover when a category has no designs. */
export function useCategoryCardImages(categories: readonly CardCategory[]): string[] {
  const [tours] = useState<string[][]>(() =>
    categories.map((category) => {
      const dir = CATEGORY_DIRS[category.id];
      const slides = dir ? slideNumbers(dir) : [];
      return shuffle(slides).map((slide) => cardImageUrl(dir, slide));
    })
  );
  const [activeIndexes, setActiveIndexes] = useState<number[]>(() => categories.map(() => 0));
  const waveTimeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // One stagger wave after another: every card steps to its next image, in snake order
  useEffect(() => {
    function runWave() {
      waveTimeoutRef.current.forEach(clearTimeout);
      waveTimeoutRef.current = [];
      tours.forEach((tour, idx) => {
        if (tour.length < 2) return;
        const visualPosition = Math.max(0, snakePattern.indexOf(idx));
        const t = setTimeout(() => {
          setActiveIndexes((prev) => {
            const next = [...prev];
            next[idx] = (next[idx] + 1) % tour.length;
            return next;
          });
        }, visualPosition * STAGGER_MS);
        waveTimeoutRef.current.push(t);
      });
      waveTimeoutRef.current.push(setTimeout(runWave, WAVE_INTERVAL_MS));
    }
    waveTimeoutRef.current.push(setTimeout(runWave, WAVE_INTERVAL_MS));
    return () => waveTimeoutRef.current.forEach(clearTimeout);
  }, [tours]);

  // Warm the cache with each card's next image so the crossfade never shows a blank
  useEffect(() => {
    tours.forEach((tour, idx) => {
      if (tour.length < 2) return;
      const preload = new Image();
      preload.src = tour[(activeIndexes[idx] + 1) % tour.length];
    });
  }, [tours, activeIndexes]);

  return useMemo(
    () =>
      categories.map((category, idx) => {
        const tour = tours[idx];
        return tour.length ? tour[activeIndexes[idx] % tour.length] : category.image;
      }),
    [categories, tours, activeIndexes]
  );
}
