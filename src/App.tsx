import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SideNav } from "@/components/SideNav";
import Index from "./pages/Index";
import Products from "./pages/Products";
import Gallery from "./pages/Gallery";
import Quality from "./pages/Quality";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Category from "./pages/Category";
import ProductDetail from "./pages/ProductDetail";
import NotFound from "./pages/NotFound";

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
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/products" element={<Products />} />
              {/* <Route path="/gallery" element={<Gallery />} /> */}
              <Route path="/category/:categoryId" element={<Category />} />
              <Route path="/category/:categoryId/:productId" element={<ProductDetail />} />
              <Route path="/quality" element={<Quality />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
