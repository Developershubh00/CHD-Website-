import { useState } from 'react';
import { Send, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const ContactFormModal = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  const [focused, setFocused] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Form submitted:', formData);
    setIsSubmitting(false);
    setIsSuccess(true);
    
    // Reset form after success
    setTimeout(() => {
      setFormData({ name: '', email: '', message: '' });
      setIsSuccess(false);
    }, 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const inputVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Name Field */}
      <motion.div
        className="relative"
        variants={inputVariants}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <motion.label
          htmlFor="name"
          className={`absolute left-0 transition-all duration-300 pointer-events-none ${
            focused === 'name' || formData.name
              ? '-top-6 text-sm text-blue-400'
              : 'top-4 text-lg text-gray-400'
          }`}
        >
          Your Name
        </motion.label>
        <input
          id="name"
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          onFocus={() => setFocused('name')}
          onBlur={() => setFocused(null)}
          className="w-full px-0 py-4 bg-transparent border-0 border-b-2 border-gray-600 focus:border-blue-400 outline-none transition-all duration-300 text-lg text-white"
          required
        />
        <motion.div
          className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-blue-400 to-purple-400"
          initial={{ width: 0 }}
          animate={{ width: focused === 'name' ? '100%' : '0%' }}
          transition={{ duration: 0.3 }}
        />
      </motion.div>

      {/* Email Field */}
      <motion.div
        className="relative"
        variants={inputVariants}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <motion.label
          htmlFor="email"
          className={`absolute left-0 transition-all duration-300 pointer-events-none ${
            focused === 'email' || formData.email
              ? '-top-6 text-sm text-blue-400'
              : 'top-4 text-lg text-gray-400'
          }`}
        >
          Your Email
        </motion.label>
        <input
          id="email"
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          onFocus={() => setFocused('email')}
          onBlur={() => setFocused(null)}
          className="w-full px-0 py-4 bg-transparent border-0 border-b-2 border-gray-600 focus:border-blue-400 outline-none transition-all duration-300 text-lg text-white"
          required
        />
        <motion.div
          className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-blue-400 to-purple-400"
          initial={{ width: 0 }}
          animate={{ width: focused === 'email' ? '100%' : '0%' }}
          transition={{ duration: 0.3 }}
        />
      </motion.div>

      {/* Message Field */}
      <motion.div
        className="relative"
        variants={inputVariants}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <motion.label
          htmlFor="message"
          className={`absolute left-0 transition-all duration-300 pointer-events-none ${
            focused === 'message' || formData.message
              ? '-top-6 text-sm text-blue-400'
              : 'top-4 text-lg text-gray-400'
          }`}
        >
          Your Message
        </motion.label>
        <textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          onFocus={() => setFocused('message')}
          onBlur={() => setFocused(null)}
          rows={4}
          className="w-full px-0 py-4 bg-transparent border-0 border-b-2 border-gray-600 focus:border-blue-400 outline-none transition-all duration-300 text-lg resize-none text-white"
          required
        />
        <motion.div
          className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-blue-400 to-purple-400"
          initial={{ width: 0 }}
          animate={{ width: focused === 'message' ? '100%' : '0%' }}
          transition={{ duration: 0.3 }}
        />
      </motion.div>

      {/* Submit Button */}
      <motion.div
        variants={inputVariants}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <motion.button
          type="submit"
          disabled={isSubmitting || isSuccess}
          className="group relative px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white overflow-hidden rounded-lg disabled:opacity-70 disabled:cursor-not-allowed"
          whileHover={{ scale: isSubmitting || isSuccess ? 1 : 1.05 }}
          whileTap={{ scale: isSubmitting || isSuccess ? 1 : 0.95 }}
        >
          {/* Animated background */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-purple-600 to-blue-500"
            initial={{ x: '100%' }}
            whileHover={{ x: 0 }}
            transition={{ duration: 0.3 }}
          />

          {/* Button Content */}
          <span className="relative z-10 flex items-center justify-center gap-2 font-light tracking-wide">
            <AnimatePresence mode="wait">
              {isSubmitting ? (
                <motion.span
                  key="submitting"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2"
                >
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </motion.span>
              ) : isSuccess ? (
                <motion.span
                  key="success"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-2"
                >
                  <Check className="w-5 h-5" />
                  Message Sent!
                </motion.span>
              ) : (
                <motion.span
                  key="default"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex items-center gap-2"
                >
                  Send Message
                  <motion.span
                    animate={{
                      x: [0, 5, 0],
                      y: [0, -5, 0],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <Send className="w-5 h-5" />
                  </motion.span>
                </motion.span>
              )}
            </AnimatePresence>
          </span>

          {/* Hover shine effect */}
          <motion.div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
            initial={false}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              animate={{
                x: ['-200%', '200%'],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </motion.div>
        </motion.button>
      </motion.div>
    </form>
  );
};