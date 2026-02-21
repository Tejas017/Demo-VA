import React, { useState } from "react";
import {
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaFacebook,
  FaTwitter,
  FaLinkedin,
  FaInstagram,
} from "react-icons/fa";

const ContactUs = () => {
  const [form, setForm] = useState({
    CName83: "",
    CEmail83: "",
    CMessage83: "",
  });

  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Here you would typically handle form submission, e.g., send to API
    setSubmitted(true);
  };

  return (
    <div className="contact-page-wrapper">
      <div className="contact-info-section">
        <h2 className="contact-info-title">Get in Touch</h2>
        <p className="contact-info-subtitle">
          We'd love to hear from you! Reach out to us through any of these
          channels.
        </p>

        <div className="contact-info-cards">
          <div className="contact-info-card">
            <div className="contact-card-icon">
              <FaPhone />
            </div>
            <h3>Phone</h3>
            <p>+1 (555) 123-4567</p>
          </div>

          <div className="contact-info-card">
            <div className="contact-card-icon">
              <FaEnvelope />
            </div>
            <h3>Email</h3>
            <p>support@voiceassist.com</p>
          </div>

          <div className="contact-info-card">
            <div className="contact-card-icon">
              <FaMapMarkerAlt />
            </div>
            <h3>Address</h3>
            <p>
              2429 Military Road, Suite 300
              <br />
              Niagara Falls, NY 14304
            </p>
          </div>
        </div>

        <div className="contact-social-section">
          <h3 className="contact-social-title">Follow Us</h3>
          <div className="contact-social-icons">
            <a href="#" className="contact-social-link facebook">
              <FaFacebook />
            </a>
            <a href="#" className="contact-social-link twitter">
              <FaTwitter />
            </a>
            <a href="#" className="contact-social-link linkedin">
              <FaLinkedin />
            </a>
            <a href="#" className="contact-social-link instagram">
              <FaInstagram />
            </a>
          </div>
        </div>
      </div>

      <div className="contact-form-container">
        <h2 className="contact-form-title">Contact Us</h2>
        <p className="contact-form-desc">
          Connect with us by filling out the form below.
        </p>
        {submitted ? (
          <div className="contact-form-success">
            Thank you for contacting us!
          </div>
        ) : (
          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="contact-form-group">
              <label htmlFor="CName83">Name:</label>
              <input
                type="text"
                id="CName83"
                name="CName83"
                value={form.CName83}
                onChange={handleChange}
                required
                className="contact-form-input"
              />
            </div>
            <div className="contact-form-group">
              <label htmlFor="CEmail83">Email:</label>
              <input
                type="email"
                id="CEmail83"
                name="CEmail83"
                value={form.CEmail83}
                onChange={handleChange}
                required
                className="contact-form-input"
              />
            </div>
            <div className="contact-form-group">
              <label htmlFor="CMessage83">Message:</label>
              <textarea
                id="CMessage83"
                name="CMessage83"
                value={form.CMessage83}
                onChange={handleChange}
                required
                rows={4}
                className="contact-form-textarea"
              />
            </div>
            <button type="submit" className="contact-form-btn">
              Send
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ContactUs;
