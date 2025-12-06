# Product Data Structure Guide

## 📋 Overview

This guide explains how to modify product images, titles, descriptions, and tags in your application.

---

## 🏗️ Data Structure

### **Location**: `src/pages/ProductDetail.tsx` and `src/pages/Category.tsx`

Both files use the same `categoryData` structure to keep data in sync.

### **Product Type Structure**:

```typescript
type Product = {
  id: string;              // Unique identifier (e.g., "rug-1", "rug-2")
  src: string;             // Main image for category grid (shown in /category page)
  images: string[];        // Array of 3 images for product detail carousel
  title: string;           // Product name/title
  description: string;      // Product description (shown on detail page)
  tags: string[];          // Array of feature tags (e.g., ["handwoven", "natural"])
};
```

---

## 🖼️ Image Structure Explained

### **1. `src` (Single Image)**
- **Purpose**: Main/primary image shown in the category grid (`/category/rugs`)
- **Usage**: This is what users see when browsing products in a category
- **Example**: `src: lifestyleRug`

### **2. `images` (Array of 3 Images)**
- **Purpose**: 3 images for the auto-rotating carousel on product detail page
- **Behavior**: 
  - Auto-rotates every 2 seconds
  - Users can click thumbnails to manually select an image
  - Shows image counter (1/3, 2/3, 3/3)
- **Example**: 
  ```typescript
  images: [
    lifestyleRug,  // Image 1
    rugImage,      // Image 2
    lifestyleRug,  // Image 3
  ]
  ```

---

## ✏️ How to Change Product Data

### **Step 1: Open the File**
Open `src/pages/ProductDetail.tsx` and find the `categoryData` object (around line 240).

### **Step 2: Locate Your Category**
Find the category you want to edit. For example, for rugs:
```typescript
rugs: {
  name: "Rugs",
  products: Array.from({ length: 42 }, (_, i) => ({
    // Product data here
  })),
}
```

### **Step 3: Modify Individual Product Properties**

#### **Change Images**:
```typescript
products: Array.from({ length: 42 }, (_, i) => ({
  id: `rug-${i + 1}`,
  src: yourMainImage,  // ← Change this for category grid image
  
  images: [
    yourImage1,  // ← Image 1 in carousel
    yourImage2,  // ← Image 2 in carousel
    yourImage3,  // ← Image 3 in carousel
  ],
  
  // ... rest of properties
}))
```

**To use your own images**:
1. Add your image files to `src/assets/` folder
2. Import at the top of the file:
   ```typescript
   import yourImage from "@/assets/your-image.jpg";
   ```
3. Use in the product data:
   ```typescript
   src: yourImage,
   images: [yourImage, yourImage2, yourImage3],
   ```

#### **Change Title**:
```typescript
title: `Your Custom Title ${i + 1}`,  // ← Change this
```

**Example**:
```typescript
title: `Premium Handwoven Rug Design ${i + 1}`,
```

#### **Change Description**:
```typescript
description: `Your custom description here. This can be as long as you want. 
It will be displayed on the product detail page. Make it detailed and 
compelling to attract customers.`,  // ← Change this
```

**Example**:
```typescript
description: `Exquisite handwoven rug featuring traditional patterns. 
Crafted by skilled artisans using premium natural fibers. Each piece 
is unique and adds elegance to any space. Available in multiple sizes.`,
```

#### **Change Tags**:
```typescript
tags: ["tag1", "tag2", "tag3"],  // ← Change this
```

**Example**:
```typescript
tags: ["handwoven", "natural", "eco-friendly", "premium"],
```

---

## 🎨 Auto-Rotation Feature

### **How It Works**:
1. **Automatic**: Images rotate every 2 seconds automatically
2. **Manual Override**: When user clicks a thumbnail, auto-rotation pauses for 5 seconds, then resumes
3. **Smooth Transitions**: Uses CSS transitions for smooth image changes
4. **Image Counter**: Shows current image number (e.g., "1 / 3") in top-right corner

### **Customization** (in `ProductDetail.tsx`):

**Change rotation speed** (line ~385):
```typescript
intervalRef.current = setInterval(() => {
  setSelectedImageIndex((prev) => (prev + 1) % product.images.length);
}, 2000); // ← Change 2000 to milliseconds (2000 = 2 seconds)
```

**Change pause duration after manual selection** (line ~400):
```typescript
setTimeout(() => {
  // Restart auto-rotation
}, 5000); // ← Change 5000 to milliseconds (5000 = 5 seconds)
```

---

## 🖱️ Thumbnail Navigation

### **Design Features**:
- **3 Thumbnails**: One for each image in the carousel
- **Active State**: Selected thumbnail has accent border and shadow
- **Hover Effects**: Smooth scale and border color changes
- **Responsive**: Adapts to mobile and desktop screens
- **Accessibility**: Includes ARIA labels for screen readers

### **Layout**:
- Thumbnails are positioned **below** the main image
- Centered horizontally
- Size: 80x80px on mobile, 96x96px on desktop
- Rounded corners with modern styling

---

## 📝 Complete Example: Editing a Rug Product

```typescript
rugs: {
  name: "Rugs",
  products: Array.from({ length: 42 }, (_, i) => ({
    id: `rug-${i + 1}`,
    
    // Main image for category grid
    src: i % 2 === 0 ? lifestyleRug : rugImage,
    
    // 3 images for detail page carousel
    images: [
      i % 2 === 0 ? lifestyleRug : rugImage,  // Image 1
      rugImage,                                // Image 2
      lifestyleRug,                            // Image 3
    ],
    
    // Product title
    title: `Handwoven Rug Type ${i + 1}`,
    
    // Product description
    description: `Premium quality handwoven rug with unique design pattern ${i + 1}. 
    Crafted with precision and care using traditional weaving techniques passed 
    down through generations. Each piece is unique and adds warmth and character 
    to any space. Available in various sizes and patterns to match your home decor.`,
    
    // Feature tags
    tags: [
      "handwoven", 
      "natural", 
      i % 3 === 0 ? "living room" : i % 3 === 1 ? "bedroom" : "dining"
    ],
  })),
},
```

---

## 🔄 Synchronization

**Important**: Both `Category.tsx` and `ProductDetail.tsx` use the same `categoryData` structure. 

- **Category Page** (`Category.tsx`): Uses `src` to show product cards
- **Product Detail Page** (`ProductDetail.tsx`): Uses `images` array for carousel

**To keep data in sync**, make sure both files have the same `categoryData` structure. Currently, they're duplicated - consider moving to a shared file later.

---

## 🎯 Quick Reference: What to Change Where

| What to Change | Where to Find | Example Location |
|---------------|---------------|------------------|
| **Product Images** | `images: [...]` array | Line ~250 in ProductDetail.tsx |
| **Product Title** | `title: "..."` | Line ~251 in ProductDetail.tsx |
| **Product Description** | `description: "..."` | Line ~252 in ProductDetail.tsx |
| **Product Tags** | `tags: [...]` array | Line ~253 in ProductDetail.tsx |
| **Category Grid Image** | `src: ...` | Line ~249 in ProductDetail.tsx |
| **Rotation Speed** | `setInterval(..., 2000)` | Line ~385 in ProductDetail.tsx |
| **Number of Products** | `Array.from({ length: 42 }` | Line ~247 in ProductDetail.tsx |

---

## 💡 Tips

1. **Use High-Quality Images**: For best results, use images with consistent aspect ratios
2. **Keep Descriptions Engaging**: Write detailed, compelling descriptions
3. **Use Relevant Tags**: Tags help with search functionality
4. **Test After Changes**: Always test the product detail page after making changes
5. **Image Formats**: Supported formats: `.jpg`, `.png`, `.webp`

---

## 🚀 Next Steps

1. Replace placeholder images with your actual product images
2. Customize titles and descriptions for each product
3. Add relevant tags for better searchability
4. Adjust rotation speed if needed
5. Test the carousel and thumbnail navigation

---

## 📞 Need Help?

If you need to:
- Add more than 3 images per product
- Change the layout of thumbnails
- Modify the auto-rotation behavior
- Add image zoom functionality

Just ask and I can help you implement these features!

