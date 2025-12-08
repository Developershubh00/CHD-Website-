import { useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { Float, PerspectiveCamera, useTexture } from "@react-three/drei";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import rugImage from "@/assets/product-rug.png";
import placematImage from "@/assets/product-placemat.png";
import runnerImage from "@/assets/product-runner.png";
import cushionImage from "@/assets/product-cushion.jpg";
import throwImage from "@/assets/product-throw.jpg";
import beddingImage from "@/assets/product-bedding.jpg";
import bathmatImage from "@/assets/product-bathmat.jpg";
import chairpadImage from "@/assets/product-chairpad.jpg";

const categories = [
  { id: "rugs", name: "Rugs", image: rugImage, description: "Handwoven rugs for every space" },
  { id: "placemats", name: "Placemats", image: placematImage, description: "Elegant table settings for dining" },
  { id: "runners", name: "Table Runners", image: runnerImage, description: "Beautiful runners for your tables" },
  { id: "cushions", name: "Cushions", image: cushionImage, description: "Comfortable cushions" },
  { id: "throws", name: "Throws", image: throwImage, description: "Soft throws and blankets" },
  { id: "bedding", name: "Premium Bedding", image: beddingImage, description: "Luxury bedding collections" },
  { id: "bathmats", name: "Bath Mats", image: bathmatImage, description: "Spa-quality bath mats" },
  { id: "chairpads", name: "Tote Bags", image: chairpadImage, description: "Durable reusable totes" },
];

interface ProductCard3DProps {
  position: [number, number, number];
  category: typeof categories[0];
  onNavigate: (id: string) => void;
  index: number;
}

function ProductCard3D({ position, category, onNavigate, index }: ProductCard3DProps) {
  const meshRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  
  // Load texture using useTexture hook
  const texture = useTexture(category.image);

  useFrame((state) => {
    if (meshRef.current) {
      // Gentle floating motion with offset per card
      const timeOffset = index * 0.5;
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5 + timeOffset) * 0.2;
      
      // Subtle rotation
      meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.2 + timeOffset) * 0.05;
      
      // Scale on hover
      const targetScale = hovered ? 1.1 : 1;
      meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
      <group
        ref={meshRef}
        position={position}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onNavigate(category.id);
        }}
      >
        {/* Main card with product image */}
        <mesh>
          <planeGeometry args={[3, 4]} />
          <meshStandardMaterial
            map={texture}
            side={THREE.DoubleSide}
            roughness={0.3}
            metalness={0.2}
            emissive={hovered ? new THREE.Color(0x333333) : new THREE.Color(0x000000)}
            emissiveIntensity={hovered ? 0.3 : 0}
          />
        </mesh>
        
        {/* Card border/frame */}
        <mesh position={[0, 0, -0.05]}>
          <planeGeometry args={[3.2, 4.2]} />
          <meshStandardMaterial
            color={hovered ? "#ffffff" : "#2a2a2a"}
            roughness={0.4}
            metalness={0.6}
          />
        </mesh>
        
        {/* Title background */}
        <mesh position={[0, -2.5, 0.05]}>
          <planeGeometry args={[3, 0.6]} />
          <meshStandardMaterial
            color="#000000"
            transparent
            opacity={0.7}
          />
        </mesh>
        
        {/* Title text */}
        <mesh position={[0, -2.5, 0.06]}>
          <planeGeometry args={[2.8, 0.4]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0}>
            <primitive attach="map" object={createTextTexture(category.name)} />
          </meshBasicMaterial>
        </mesh>
      </group>
    </Float>
  );
}

// Helper function to create text texture
function createTextTexture(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function CameraController() {
  const { camera, mouse } = useThree();
  
  useFrame(() => {
    // Parallax camera movement
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouse.x * 2, 0.05);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, mouse.y * 1.5, 0.05);
    camera.lookAt(0, 0, 0);
  });
  
  return null;
}

function Scene({ onNavigate }: { onNavigate: (id: string) => void }) {
  // Arrange products in a circular 3D formation
  const radius = 8;
  const positions: [number, number, number][] = categories.map((_, index) => {
    const angle = (index / categories.length) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 3;
    const y = 0;
    return [x, y, z];
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 10]} intensity={1.2} />
      <pointLight position={[-10, 5, -5]} intensity={0.8} color="#a78bfa" />
      <pointLight position={[10, 5, -5]} intensity={0.8} color="#60a5fa" />
      <spotLight position={[0, 10, 5]} angle={0.5} intensity={0.8} penumbra={0.5} />
      
      <CameraController />
      
      {categories.map((category, index) => (
        <ProductCard3D
          key={category.id}
          position={positions[index]}
          category={category}
          onNavigate={onNavigate}
          index={index}
        />
      ))}
      
      {/* Subtle background grid */}
      <gridHelper args={[30, 30, '#444444', '#222222']} position={[0, -3, 0]} />
    </>
  );
}

export const ProductCategories3D = () => {
  const navigate = useNavigate();

  const handleNavigate = (categoryId: string) => {
    navigate(`/category/${categoryId}`);
  };

  return (
    <section id="products" className="py-32 px-6 bg-gradient-to-b from-background to-muted/30">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-6xl font-light mb-4">Our Products</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
            Explore our collection of handcrafted textiles in immersive 3D
          </p>
        </div>

        <div className="w-full h-[700px] rounded-2xl overflow-hidden border-2 border-border/30 shadow-2xl bg-gradient-to-br from-background via-muted/20 to-background">
          <Canvas
            camera={{ position: [0, 2, 12], fov: 60 }}
            gl={{ 
              antialias: true, 
              alpha: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.2
            }}
          >
            <PerspectiveCamera makeDefault position={[0, 2, 12]} />
            <Scene onNavigate={handleNavigate} />
          </Canvas>
        </div>

        <div className="text-center mt-8 space-y-2">
          <p className="text-sm text-muted-foreground">
            Move your mouse to explore • Click any product to view details
          </p>
          <div className="flex justify-center gap-4 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleNavigate(cat.id)}
                className="px-4 py-2 text-xs rounded-full bg-accent/10 hover:bg-accent/20 text-foreground transition-colors"
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
