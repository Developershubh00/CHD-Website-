// import { ContactFormModal } from "@/components/ContactFormModal";
// import { motion } from "framer-motion";
// import { MapPin, Phone, Mail, ArrowUpRight } from "lucide-react";

// const ContactSection = () => {
//   const currentYear = new Date().getFullYear();

//   const socialLinks = [
//     { name: "LinkedIn", href: "#" },
//     { name: "Instagram", href: "#" },
//     { name: "Facebook", href: "#" },
//   ];

//   const quickLinks = [
//     { name: "About", href: "#about" },
//     { name: "Products", href: "#products" },
//     { name: "Gallery", href: "#gallery" },
//     { name: "Certifications", href: "#certifications" },
//   ];

//   return (
//     <footer className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
//       {/* Animated background elements */}
//       <div className="absolute inset-0 overflow-hidden pointer-events-none">
//         <motion.div
//           className="absolute w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"
//           animate={{
//             x: [0, 100, 0],
//             y: [0, 50, 0],
//           }}
//           transition={{
//             duration: 20,
//             repeat: Infinity,
//             ease: "linear",
//           }}
//           style={{ top: "10%", left: "10%" }}
//         />
//         <motion.div
//           className="absolute w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"
//           animate={{
//             x: [0, -100, 0],
//             y: [0, -50, 0],
//           }}
//           transition={{
//             duration: 15,
//             repeat: Infinity,
//             ease: "linear",
//           }}
//           style={{ bottom: "10%", right: "10%" }}
//         />
//       </div>

//       <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28">
//         {/* Main Content Grid */}
//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16">
//           {/* Left Side - Contact Form */}
//           <motion.div
//             initial={{ opacity: 0, x: -30 }}
//             whileInView={{ opacity: 1, x: 0 }}
//             viewport={{ once: true }}
//             transition={{ duration: 0.6 }}
//           >
//             <motion.h2
//               className="text-5xl md:text-7xl font-light mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400"
//               initial={{ opacity: 0, y: 20 }}
//               whileInView={{ opacity: 1, y: 0 }}
//               viewport={{ once: true }}
//               transition={{ duration: 0.6, delay: 0.2 }}
//             >
//               Let's Connect
//             </motion.h2>
//             <motion.p
//               className="text-gray-400 text-lg mb-12 max-w-md"
//               initial={{ opacity: 0, y: 20 }}
//               whileInView={{ opacity: 1, y: 0 }}
//               viewport={{ once: true }}
//               transition={{ duration: 0.6, delay: 0.3 }}
//             >
//               Have a project in mind? We'd love to hear from you. Send us a
//               message and we'll respond as soon as possible.
//             </motion.p>
//             <ContactFormModal />
//           </motion.div>

//           {/* Right Side - Contact Info & Links */}
//           <motion.div
//             initial={{ opacity: 0, x: 30 }}
//             whileInView={{ opacity: 1, x: 0 }}
//             viewport={{ once: true }}
//             transition={{ duration: 0.6 }}
//             className="space-y-12"
//           >
//             {/* Contact Information */}
//             <div>
//               <h3 className="text-2xl font-light mb-8 text-gray-200">
//                 Get in Touch
//               </h3>
//               <div className="space-y-6">
//                 {/* Name & Position */}
//                 <motion.div
//                   className="group"
//                   whileHover={{ x: 10 }}
//                   transition={{ type: "spring", stiffness: 300 }}
//                 >
//                   <p className="text-2xl font-light mb-1">Vikram Jaglan</p>
//                   <p className="text-gray-400">Managing Partner</p>
//                 </motion.div>

//                 {/* Phone */}
//                 <motion.a
//                   href="tel:+919711753499"
//                   className="flex items-center gap-4 group hover:text-blue-400 transition-colors"
//                   whileHover={{ x: 10 }}
//                   transition={{ type: "spring", stiffness: 300 }}
//                 >
//                   <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
//                     <Phone className="w-5 h-5" />
//                   </div>
//                   <div>
//                     <p className="text-sm text-gray-400">Phone</p>
//                     <p className="text-lg">+91 9711753499</p>
//                   </div>
//                 </motion.a>

//                 {/* Email */}
//                 <motion.a
//                   href="mailto:vikram@creativehomedecorllp.com"
//                   className="flex items-center gap-4 group hover:text-blue-400 transition-colors"
//                   whileHover={{ x: 10 }}
//                   transition={{ type: "spring", stiffness: 300 }}
//                 >
//                   <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
//                     <Mail className="w-5 h-5" />
//                   </div>
//                   <div>
//                     <p className="text-sm text-gray-400">Email</p>
//                     <p className="text-lg break-all">
//                       vikram@creativehomedecorllp.com
//                     </p>
//                   </div>
//                 </motion.a>

//                 {/* Address */}
//                 <motion.div
//                   className="flex items-center gap-4 group"
//                   whileHover={{ x: 10 }}
//                   transition={{ type: "spring", stiffness: 300 }}
//                 >
//                   <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
//                     <MapPin className="w-5 h-5" />
//                   </div>
//                   <div>
//                     <p className="text-sm text-gray-400">Location</p>
//                     <p className="text-lg">Panipat, Haryana, India</p>
//                   </div>
//                 </motion.div>
//               </div>
//             </div>

//             {/* Quick Links */}
//             <div>
//               <h3 className="text-2xl font-light mb-6 text-gray-200">
//                 Quick Links
//               </h3>
//               <div className="grid grid-cols-2 gap-4">
//                 {quickLinks.map((link, index) => (
//                   <motion.a
//                     key={link.name}
//                     href={link.href}
//                     className="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
//                     initial={{ opacity: 0, y: 10 }}
//                     whileInView={{ opacity: 1, y: 0 }}
//                     viewport={{ once: true }}
//                     transition={{ duration: 0.3, delay: index * 0.1 }}
//                     whileHover={{ x: 5 }}
//                   >
//                     <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
//                     {link.name}
//                   </motion.a>
//                 ))}
//               </div>
//             </div>

//             {/* Social Links */}
//             <div>
//               <h3 className="text-2xl font-light mb-6 text-gray-200">
//                 Follow Us
//               </h3>
//               <div className="flex gap-4">
//                 {socialLinks.map((social, index) => (
//                   <motion.a
//                     key={social.name}
//                     href={social.href}
//                     className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-blue-500/30 transition-colors text-sm"
//                     initial={{ opacity: 0, scale: 0 }}
//                     whileInView={{ opacity: 1, scale: 1 }}
//                     viewport={{ once: true }}
//                     transition={{
//                       duration: 0.3,
//                       delay: index * 0.1,
//                       type: "spring",
//                       stiffness: 200,
//                     }}
//                     whileHover={{ scale: 1.1, rotate: 5 }}
//                     whileTap={{ scale: 0.95 }}
//                   >
//                     {social.name.slice(0, 2)}
//                   </motion.a>
//                 ))}
//               </div>
//             </div>
//           </motion.div>
//         </div>

//         {/* Footer Bottom */}
//         <motion.div
//           className="pt-8 border-t border-white/10"
//           initial={{ opacity: 0 }}
//           whileInView={{ opacity: 1 }}
//           viewport={{ once: true }}
//           transition={{ duration: 0.6, delay: 0.4 }}
//         >
//           <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-gray-400 text-sm">
//             <p>
//               © {currentYear} Creative Home Décor LLP. All rights reserved.
//             </p>
//             <div className="flex gap-6">
//               <motion.a
//                 href="#privacy"
//                 className="hover:text-white transition-colors"
//                 whileHover={{ y: -2 }}
//               >
//                 Privacy Policy
//               </motion.a>
//               <motion.a
//                 href="#terms"
//                 className="hover:text-white transition-colors"
//                 whileHover={{ y: -2 }}
//               >
//                 Terms of Service
//               </motion.a>
//             </div>
//           </div>
//         </motion.div>
//       </div>
//     </footer>
//   );
// };

// export default ContactSection;

import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Mail, ArrowUpRight, Send, Linkedin } from "lucide-react";

const ContactFormModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      // Replace with your Google Apps Script Web App URL
      const SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
      
      const response = await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      // Since we're using no-cors, we can't read the response
      // Assume success if no error is thrown
      setSubmitStatus('success');
      setFormData({
        name: "",
        email: "",
        phone: "",
        company: "",
        message: ""
      });
      
      setTimeout(() => {
        setIsOpen(false);
        setSubmitStatus(null);
      }, 2000);
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(true)}
        className="group relative px-8 py-4 bg-slate-800 text-white rounded-full overflow-hidden hover:bg-slate-700 transition-all duration-300"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="relative z-10 flex items-center gap-2">
          Start a Conversation
          <Send className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </span>
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600"
          initial={{ x: "-100%" }}
          whileHover={{ x: 0 }}
          transition={{ duration: 0.3 }}
        />
      </motion.button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-card rounded-2xl p-4 md:p-6 max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden"
          >
            <div className="flex justify-between items-center mb-3 md:mb-4 flex-shrink-0">
              <h3 className="text-xl md:text-2xl font-light text-slate-900 dark:text-foreground">Get in Touch</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-foreground text-xl md:text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-2.5 md:space-y-3 flex-1 flex flex-col min-h-0">
              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 dark:text-foreground mb-0.5">
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 dark:text-foreground mb-0.5">
                  Email *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 dark:text-foreground mb-0.5">
                  Phone
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 dark:text-foreground mb-0.5">
                  Company
                </label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              <div>
                <label className="block text-xs md:text-sm font-medium text-slate-700 dark:text-foreground mb-0.5">
                  Message *
                </label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows={2}
                  className="w-full h-20 md:h-24 px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base border border-slate-300 dark:border-border rounded-lg focus:ring-2 focus:ring-slate-500 dark:focus:ring-accent focus:border-transparent outline-none resize-none bg-white dark:bg-background text-slate-900 dark:text-foreground"
                />
              </div>

              {submitStatus === 'success' && (
                <div className="p-2.5 md:p-3 text-xs md:text-sm bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 rounded-lg">
                  Thank you! We'll get back to you soon.
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="p-2.5 md:p-3 text-xs md:text-sm bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300 rounded-lg">
                  Something went wrong. Please try again.
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-slate-900 dark:bg-slate-800 text-white py-2 md:py-2.5 text-sm md:text-base rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 mt-2"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
};

const ContactSection = () => {
  const currentYear = new Date().getFullYear();

  const linkedinLink = { name: "LinkedIn", href: "#" };

  const quickLinks = [
    { name: "About", href: "#about" },
    { name: "Products", href: "#products" },
    { name: "Gallery", href: "#gallery" },
    { name: "Certifications", href: "#certifications" },
  ];

  return (
    <footer className="relative bg-gradient-to-b from-white via-slate-50 to-slate-100 text-slate-900 overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgb(148 163 184 / 0.15) 1px, transparent 0)`,
          backgroundSize: '32px 32px'
        }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-6 py-20 md:py-28">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16">
          {/* Left Side - Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <motion.h2
              className="text-5xl md:text-7xl font-light mb-4 text-slate-900"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              Let's Connect
            </motion.h2>
            <motion.p
              className="text-slate-600 text-lg mb-12 max-w-md font-light"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              Have a project in mind? We'd love to hear from you. Send us a
              message and we'll respond as soon as possible.
            </motion.p>
            <ContactFormModal />
          </motion.div>

          {/* Right Side - Contact Info & Links */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-12"
          >
            {/* Contact Information */}
            <div>
              <h3 className="text-2xl font-light mb-8 text-slate-800">
                Get in Touch
              </h3>
              <div className="space-y-6">
                {/* Name & Position */}
                <motion.div
                  className="group"
                  whileHover={{ x: 10 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <p className="text-2xl font-light mb-1 text-slate-900">Vikram Jaglan</p>
                  <p className="text-slate-600">Managing Partner</p>
                </motion.div>

                {/* Phone */}
                <motion.a
                  href="tel:+919711753499"
                  className="flex items-center gap-4 group hover:text-slate-900 transition-colors"
                  whileHover={{ x: 10 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center group-hover:bg-slate-300 transition-colors">
                    <Phone className="w-5 h-5 text-slate-700" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Phone</p>
                    <p className="text-lg text-slate-700">+91 9711753499</p>
                  </div>
                </motion.a>

                {/* Email */}
                <motion.a
                  href="mailto:vikram@creativehomedecorllp.com"
                  className="flex items-center gap-4 group hover:text-slate-900 transition-colors"
                  whileHover={{ x: 10 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center group-hover:bg-slate-300 transition-colors">
                    <Mail className="w-5 h-5 text-slate-700" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Email</p>
                    <p className="text-lg break-all text-slate-700">
                      vikram@creativehomedecorllp.com
                    </p>
                  </div>
                </motion.a>

                {/* Address */}
                <motion.div
                  className="flex items-center gap-4 group"
                  whileHover={{ x: 10 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center group-hover:bg-slate-300 transition-colors">
                    <MapPin className="w-5 h-5 text-slate-700" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Location</p>
                    <p className="text-lg text-slate-700">Panipat, Haryana, India</p>
                  </div>
                </motion.div>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-2xl font-light mb-6 text-slate-800">
                Quick Links
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {quickLinks.map((link, index) => (
                  <motion.a
                    key={link.name}
                    href={link.href}
                    className="group flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    whileHover={{ x: 5 }}
                  >
                    <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    {link.name}
                  </motion.a>
                ))}
              </div>
            </div>

            {/* Social Links */}
            <div>
              <h3 className="text-2xl font-light mb-6 text-slate-800">
                Follow Us
              </h3>
              <div className="flex gap-4">
                <motion.a
                  href={linkedinLink.href}
                  className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-800 hover:text-white transition-all text-slate-700"
                  initial={{ opacity: 0, scale: 0 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.3,
                    type: "spring",
                    stiffness: 200,
                  }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Linkedin className="w-6 h-6" />
                </motion.a>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer Bottom */}
        <motion.div
          className="pt-8 border-t border-slate-300"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-slate-600 text-sm">
            <p>
              © {currentYear} Creative Home Décor LLP. All rights reserved.
            </p>
            <div className="flex gap-6">
              <motion.a
                href="#privacy"
                className="hover:text-slate-900 transition-colors"
                whileHover={{ y: -2 }}
              >
                Privacy Policy
              </motion.a>
              <motion.a
                href="#terms"
                className="hover:text-slate-900 transition-colors"
                whileHover={{ y: -2 }}
              >
                Terms of Service
              </motion.a>
            </div>
          </div>
        </motion.div>
      </div>
    </footer>
  );
};

export default ContactSection;