import { useRef, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text, RoundedBox, Float } from "@react-three/drei";
import { Link } from "react-router-dom";
import * as THREE from "three";
import rugImage from "@/assets/product-rug.png";
import placematImage from "@/assets/product-placemat.png";
import runnerImage from "@/assets/product-runner.png";
import cushionImage from "@/assets/product-cushion.jpg";
import throwImage from "@/assets/product-throw.jpg";
import beddingImage from "@/assets/product-bedding.jpg";
import bathmatImage from "@/assets/product-bathmat.jpg";
import chairpadImage from "@/assets/product-chairpad.jpg";

const products = [
  { id: "rugs", name: "Rugs", image: rugImage, description: "Handwoven rugs" },
  { id: "placemats", name: "Placemats", image: placematImage, description: "Elegant table settings" },
  { id: "runners", name: "Table Runners", image: runnerImage, description: "Beautiful runners" },
  { id: "cushions", name: "Cushions", image: cushionImage, description: "Comfortable cushions" },
  { id: "throws", name: "Throws", image: throwImage, description: "Soft throws" },
  { id: "bedding", name: "Premium Bedding", image: beddingImage, description: "Luxury bedding" },
  { id: "bathmats", name: "Bath Mats", image: bathmatImage, description: "Spa-quality mats" },
  { id: "chairpads", name: "Tote Bags", image: chairpadImage, description: "Durable reusable totes" },
];

interface ProductCardProps {
  position: [number, number, number];
  product: typeof products[0];
  scrollProgress: number;
  index: number;
}

function ProductCard3D({ position, product, scrollProgress, index }: ProductCardProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.load(product.image, setTexture);
  }, [product.image]);

  useFrame(() => {
    if (meshRef.current) {
      const offset = index * 6;
      const x = (scrollProgress * 40) - offset;
      meshRef.current.position.x = x;
      
      // Add subtle rotation based on position
      const rotationIntensity = Math.sin(x * 0.1) * 0.1;
      meshRef.current.rotation.y = rotationIntensity;
      
      // Scale effect based on distance from center
      const distanceFromCenter = Math.abs(x);
      const scale = Math.max(0.8, 1 - distanceFromCenter * 0.02);
      meshRef.current.scale.setScalar(scale);
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
      <group ref={meshRef} position={position}>
        <RoundedBox args={[4, 5, 0.2]} radius={0.1} smoothness={4}>
          <meshStandardMaterial
            map={texture}
            roughness={0.3}
            metalness={0.1}
          />
        </RoundedBox>
        
        <Text
          position={[0, -3, 0.15]}
          fontSize={0.4}
          color="#333"
          anchorX="center"
          anchorY="middle"
          font="/fonts/inter-regular.woff"
        >
          {product.name}
        </Text>
        
        <Text
          position={[0, -3.6, 0.15]}
          fontSize={0.25}
          color="#666"
          anchorX="center"
          anchorY="middle"
          maxWidth={3.5}
          font="/fonts/inter-regular.woff"
        >
          {product.description}
        </Text>
      </group>
    </Float>
  );
}

function Scene({ scrollProgress }: { scrollProgress: number }) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <pointLight position={[-10, -10, -5]} intensity={0.5} color="#fff" />
      
      {products.map((product, index) => (
        <ProductCard3D
          key={product.id}
          position={[index * 6, 0, 0]}
          product={product}
          scrollProgress={scrollProgress}
          index={index}
        />
      ))}
    </>
  );
}

export const Product3DShowcase = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const maxScroll = scrollHeight - clientHeight;
        const progress = scrollTop / maxScroll;
        setScrollProgress(progress);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto"
        style={{ height: "100vh" }}
      >
        <div style={{ height: "300vh" }}>
          <div className="sticky top-0 h-screen">
            <Canvas
              camera={{ position: [0, 0, 12], fov: 50 }}
              className="w-full h-full"
            >
              <Scene scrollProgress={scrollProgress} />
            </Canvas>
            
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
              <p className="text-sm text-muted-foreground bg-background/80 backdrop-blur-sm px-4 py-2 rounded-full">
                Scroll to explore our collection
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Product links overlay */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 flex gap-2 flex-wrap justify-center max-w-4xl px-4 z-10">
        {products.map((product, index) => {
          const isActive = Math.abs((scrollProgress * (products.length - 1)) - index) < 0.5;
          return (
            <Link
              key={product.id}
              to={`/category/${product.id}`}
              className={`px-4 py-2 rounded-full transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground scale-110"
                  : "bg-background/80 text-foreground hover:bg-accent backdrop-blur-sm"
              }`}
            >
              {product.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
};
