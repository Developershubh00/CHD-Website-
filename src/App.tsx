import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SideNav } from "@/components/SideNav";
import Index from "./pages/Index";
import Products from "./pages/Products";
import Quality from "./pages/Quality";
import Certificate from "./pages/Certificate";
import Compliance from "./pages/Compliance";
import About from "./pages/About";
import Contact from "./pages/Contact";
import NotFound from "./pages/NotFound";

// Lazy load heavy pages with 3000+ images - only loads when navigating to them
const Category = lazy(() => import("./pages/Category"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm">Loading...</p>
    </div>
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex min-h-screen w-full">
          <SideNav />
          <main className="flex-1 md:ml-20">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/products" element={<Products />} />
                <Route path="/category/:categoryId" element={<Category />} />
                <Route path="/category/:categoryId/:productId" element={<ProductDetail />} />
                <Route path="/quality" element={<Quality />} />
                <Route path="/certificate" element={<Certificate />} />
                <Route path="/compliance" element={<Compliance />} />
                <Route path="/about" element={<About />} />
                <Route path="/contact" element={<Contact />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
