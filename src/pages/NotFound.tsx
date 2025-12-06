import { useLocation, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

// Floating thread/yarn component
const FloatingThread = ({ delay, duration, x, y, rotation, length, color }: {
  delay: number;
  duration: number;
  x: number;
  y: number;
  rotation: number;
  length: number;
  color: string;
}) => (
  <motion.div
    className="absolute pointer-events-none"
    style={{ left: `${x}%`, top: `${y}%` }}
    initial={{ opacity: 0, scale: 0, rotate: rotation - 45 }}
    animate={{
      opacity: [0, 0.6, 0.6, 0],
      scale: [0, 1, 1, 0.8],
      rotate: [rotation - 45, rotation, rotation + 15, rotation],
      y: [0, -30, -20, 50],
    }}
    transition={{
      duration,
      delay,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  >
    <div
      className="rounded-full"
      style={{
        width: `${length}px`,
        height: '2px',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        boxShadow: `0 0 10px ${color}40`,
      }}
    />
  </motion.div>
);

// Woven pattern background element
const WovenLine = ({ index, horizontal }: { index: number; horizontal: boolean }) => (
  <motion.div
    className={`absolute ${horizontal ? 'h-px w-full' : 'w-px h-full'} bg-gradient-to-r from-transparent via-accent/20 to-transparent`}
    style={horizontal ? { top: `${index * 8}%` } : { left: `${index * 8}%` }}
    initial={{ opacity: 0, scale: horizontal ? { scaleX: 0 } : { scaleY: 0 } }}
    animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
    transition={{ duration: 1.5, delay: index * 0.05, ease: "easeOut" }}
  />
);

const NotFound = () => {
  const location = useLocation();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Generate floating threads
  const threads = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    delay: Math.random() * 4,
    duration: 6 + Math.random() * 4,
    x: Math.random() * 100,
    y: Math.random() * 100,
    rotation: Math.random() * 360,
    length: 40 + Math.random() * 80,
    color: ['hsl(36, 30%, 70%)', 'hsl(30, 8%, 50%)', 'hsl(32, 25%, 65%)', 'hsl(28, 25%, 60%)'][Math.floor(Math.random() * 4)],
  }));

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-br from-background via-muted/50 to-background">
      {/* Subtle woven grid pattern */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        {Array.from({ length: 13 }, (_, i) => (
          <WovenLine key={`h-${i}`} index={i} horizontal={true} />
        ))}
        {Array.from({ length: 13 }, (_, i) => (
          <WovenLine key={`v-${i}`} index={i} horizontal={false} />
        ))}
      </div>

      {/* Floating threads */}
      {threads.map((thread) => (
        <FloatingThread key={thread.id} {...thread} />
      ))}

      {/* Radial gradient spotlight following mouse */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at ${50 + mousePosition.x}% ${50 + mousePosition.y}%, hsl(36, 30%, 88%, 0.3) 0%, transparent 50%)`,
        }}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 py-12">
        {/* Animated 404 Number */}
        <motion.div
          className="relative mb-4"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          {/* Shadow/glow behind the number */}
          <motion.div
            className="absolute inset-0 blur-3xl opacity-20"
            style={{
              background: 'radial-gradient(ellipse, hsl(32, 25%, 65%) 0%, transparent 70%)',
              transform: `translate(${mousePosition.x * 0.5}px, ${mousePosition.y * 0.5}px)`,
            }}
          />
          
          {/* Main 404 text with textile texture effect */}
          <h1 className="relative font-light text-[8rem] md:text-[12rem] leading-none tracking-tighter select-none">
            <motion.span
              className="inline-block bg-gradient-to-b from-charcoal via-charcoal-light to-muted-foreground bg-clip-text text-transparent"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              animate={{
                backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            >
              4
            </motion.span>
            <motion.span
              className="inline-block mx-[-0.05em]"
              animate={{ 
                rotateY: [0, 360],
                scale: [1, 1.05, 1],
              }}
              transition={{ 
                rotateY: { duration: 8, repeat: Infinity, ease: "linear" },
                scale: { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }}
            >
              <span 
                className="inline-block text-[hsl(32,25%,65%)]"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                0
              </span>
            </motion.span>
            <motion.span
              className="inline-block bg-gradient-to-b from-charcoal via-charcoal-light to-muted-foreground bg-clip-text text-transparent"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              4
            </motion.span>
          </h1>

          {/* Decorative underline */}
          <motion.div
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 h-px bg-gradient-to-r from-transparent via-charcoal/40 to-transparent"
            initial={{ width: 0 }}
            animate={{ width: '60%' }}
            transition={{ duration: 1.5, delay: 0.5 }}
          />
        </motion.div>

        {/* Message */}
        <motion.div
          className="text-center max-w-lg mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          <h2 
            className="text-3xl md:text-4xl font-light mb-4 tracking-wide text-foreground"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Page Not Found
          </h2>
          <p className="text-muted-foreground text-lg mb-6 leading-relaxed">
            The thread you're looking for seems to have come loose. 
            This page doesn't exist in our collection.
          </p>
          
          {/* Show attempted path */}
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted/50 border border-border/50 text-sm text-muted-foreground"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <Search className="w-4 h-4" />
            <code className="font-mono">{location.pathname}</code>
          </motion.div>
        </motion.div>

        {/* Action buttons */}
        <motion.div
          className="flex flex-col sm:flex-row gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Button
            asChild
            size="lg"
            className="group relative overflow-hidden bg-charcoal hover:bg-charcoal-light text-cream px-8 py-6 text-base tracking-wide transition-all duration-300"
          >
            <Link to="/">
              <motion.span
                className="absolute inset-0 bg-gradient-to-r from-accent/20 to-transparent"
                initial={{ x: '-100%' }}
                whileHover={{ x: '100%' }}
                transition={{ duration: 0.5 }}
              />
              <Home className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform" />
              Return Home
            </Link>
          </Button>
          
          <Button
            asChild
            variant="outline"
            size="lg"
            className="group px-8 py-6 text-base tracking-wide border-charcoal/30 hover:bg-charcoal/5 hover:border-charcoal/50 transition-all duration-300"
          >
            <Link to="/products">
              <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
              Browse Products
            </Link>
          </Button>
        </motion.div>

        {/* Decorative bottom element */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 text-muted-foreground/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
        >
          <div className="w-12 h-px bg-gradient-to-r from-transparent to-muted-foreground/30" />
          <span className="text-xs uppercase tracking-[0.3em]">Creative Home Decor</span>
          <div className="w-12 h-px bg-gradient-to-l from-transparent to-muted-foreground/30" />
        </motion.div>
      </div>

      {/* Ambient corner decorations */}
      <motion.div
        className="absolute top-0 right-0 w-96 h-96 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2 }}
      >
        <div className="absolute inset-0 bg-gradient-to-bl from-accent/10 via-transparent to-transparent" />
      </motion.div>
      
      <motion.div
        className="absolute bottom-0 left-0 w-96 h-96 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2 }}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-sand/20 via-transparent to-transparent" />
      </motion.div>
    </div>
  );
};

export default NotFound;
