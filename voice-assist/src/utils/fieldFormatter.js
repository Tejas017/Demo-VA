/**
 * Smart field value formatting for voice input
 * Handles email, date, time, and name capitalization
 */

export const formatFieldValue = (field, value) => {
  if (!value) return value;

  const fieldLower = field.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Email formatting
  if (fieldLower === "email") {
    // Pattern 1: "tejas at google" → "tejas@gmail.com"
    const atMatch = value.match(/^(.+?)\s+at\s+(.+?)$/i);
    if (atMatch) {
      const [, name, provider] = atMatch;
      const domains = {
        google: "gmail.com",
        gmail: "gmail.com",
        yahoo: "yahoo.com",
        outlook: "outlook.com",
        hotmail: "hotmail.com",
        proton: "protonmail.com",
        icloud: "icloud.com",
        harris: "harriscomputer.com",
        bizmatics: "bizmatics.com",
      };
      const normalizedProvider = provider.toLowerCase().replace(/\s+/g, "");
      if (domains[normalizedProvider]) {
        return `${name.replace(/\s+/g, "")}@${domains[normalizedProvider]}`;
      }
      // If provider not in list, use it as-is (e.g., "at company" → "@company.com")
      return `${name.replace(/\s+/g, "")}@${normalizedProvider}.com`;
    }

    // Pattern 2: "tejas google" → "tejas@gmail.com" (space-separated, no "at")
    const parts = value.trim().split(/\s+/);
    if (parts.length === 2) {
      const [name, provider] = parts;
      const domains = {
        google: "gmail.com",
        gmail: "gmail.com",
        yahoo: "yahoo.com",
        outlook: "outlook.com",
        hotmail: "hotmail.com",
        proton: "protonmail.com",
        icloud: "icloud.com",
        harris: "harriscomputer.com",
        bizmatics: "bizmatics.com",
      };
      if (domains[provider.toLowerCase()]) {
        return `${name}@${domains[provider.toLowerCase()]}`;
      }
    }

    // Pattern 3: Normalize spoken email: "tejas at gmail dot com" → "tejas@gmail.com"
    return value
      .replace(/\s+/g, "") // remove all spaces
      .replace(/\bat\b/gi, "@") // "at" → "@"
      .replace(/\bdot\b/gi, ".") // "dot" → "."
      .replace(/dash/gi, "-") // "dash" → "-"
      .replace(/underscore/gi, "_"); // "underscore" → "_"
  }

  // Date formatting: "23 december 2025" → "2025-12-23"
  if (fieldLower === "date" || fieldLower === "appointmentdate") {
    try {
      const parsedDate = new Date(value);
      if (!isNaN(parsedDate.getTime())) {
        // Return ISO format YYYY-MM-DD
        return parsedDate.toISOString().split("T")[0];
      }
    } catch (e) {
      console.warn("Could not parse date:", value);
    }
    return value; // fallback to original
  }

  // Time formatting: "2 pm" → "14:00"
  if (fieldLower === "time" || fieldLower === "appointmenttime") {
    const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const meridian = match[3]?.toLowerCase();

      if (meridian === "pm" && hours < 12) hours += 12;
      if (meridian === "am" && hours === 12) hours = 0;

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}`;
    }
  }

  // Name capitalization: "john smith" → "John Smith"
  if (
    fieldLower.includes("name") ||
    fieldLower.includes("doctor") ||
    fieldLower === "dr"
  ) {
    return value
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  // Default: capitalize first letter of each word
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// Field name normalization (map spoken field names to actual form fields)
export const normalizeFieldName = (spokenField) => {
  const fieldSynonyms = {
    doctor: [
      "dr",
      "dr.",
      "doctor",
      "doctors name",
      "doctor name",
      "doc",
      "physician",
    ],
    name: ["name", "your name", "patient name", "full name"],
    email: ["email", "e-mail", "email address", "mail"],
    phone: ["phone", "telephone", "mobile", "cell", "number", "contact number"],
    date: ["date", "appointment date", "day"],
    time: ["time", "appointment time", "hour"],
    address: ["address", "street address", "location"],
    city: ["city", "town"],
    state: ["state", "province"],
    zip: ["zip", "zip code", "postal code", "postcode"],
    reason: ["reason", "reason for visit", "purpose"],
    notes: ["notes", "comments", "remarks", "additional notes"],
  };

  const lower = spokenField.toLowerCase().trim();

  for (const [key, synonyms] of Object.entries(fieldSynonyms)) {
    if (synonyms.some((s) => lower.includes(s))) {
      return key;
    }
  }

  // Fallback: remove special characters and return lowercase
  return spokenField.replace(/[^a-z0-9]/gi, "").toLowerCase();
};
