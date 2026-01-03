import { ContactForm } from "@/components/ContactForm";

const Contact = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="py-32 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-light mb-16">Contact</h1>
          <ContactForm />
        </div>
      </div>
    </div>
  );
};

export default Contact;
