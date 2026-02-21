import React from "react";
import "./MarqueeCommands.css";

const MARQUEE_TEXT =
  "Go to home • Open profile • Navigate to appointments • Open dictation • Start dictation • Stop dictation • Continue in notes • Continue in summary • Continue in message • Clear notes • Clear summary • Clear message • Fill <field> with <value> • Enter <value> in <field> • Open <field> dropdown • Select <value> • Check <option> • Uncheck <option> • Submit form • Book appointment • Scroll up • Scroll down • Refresh page • Show commands • Close commands • e.g. 'tejas at google' → tejas@gmail.com";

export default function MarqueeCommands({ className = "" }) {
  return (
    <div
      className={`marquee-wrap ${className}`}
      role="region"
      aria-label="Voice commands"
    >
      <div className="marquee" aria-hidden="false">
        <span className="marquee-text">{MARQUEE_TEXT}</span>
        <span className="marquee-text" aria-hidden="true">
          {MARQUEE_TEXT}
        </span>
      </div>
    </div>
  );
}
