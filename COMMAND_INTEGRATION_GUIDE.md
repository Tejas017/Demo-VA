# Command Integration Guide: Web Speech API → Whisper

## Overview

Your **previous project** used browser's Web Speech API (webkit) with continuous recognition.  
Your **current project** uses Whisper (local transcription) with 5-second audio chunks.

This guide shows how to port all commands from the old system to the new one.

---

## Commands Your Previous System Handled

### ✅ **Navigation**

```javascript
// Old code
case "navigate":
  navigate(`/${params.page}`);
  speak(`Navigating to ${params.page}`);
```

**Voice examples:**

- "go to home"
- "open profile"
- "navigate to appointments"

---

### ✅ **Fill Field** (with smart formatting)

```javascript
// Old code
case "fill_field":
  // Email: "tejas google" → "tejas@gmail.com"
  // Date: "23 december 2025" → "2025-12-23"
  // Time: "2 pm" → "14:00"
  // Name: "john smith" → "John Smith"
  setFieldValue(currentFormKey, field, formattedValue);
```

**Voice examples:**

- "enter John Smith in name"
- "type tejas google" (auto-completes to tejas@gmail.com)
- "set appointment date 23 december 2025"
- "set time 2 pm"

---

### ✅ **Clear Field**

```javascript
case "clear_field":
  setFieldValue(currentFormKey, field, "");
  speak(`Cleared ${field}`);
```

**Voice examples:**

- "clear name"
- "clear email field"

---

### ✅ **Scroll**

```javascript
case "scroll_up":
  window.scrollBy({ top: -300, behavior: "smooth" });

case "scroll_down":
  window.scrollBy({ top: 300, behavior: "smooth" });
```

**Voice examples:**

- "scroll down"
- "move up"

---

### ✅ **Checkbox**

```javascript
case "check_box":
  setFieldValue("contact", field, true);
  speak(`Checked ${val} under ${field}`);
```

**Voice examples:**

- "check diabetes in medical history"
- "tick smoking under habits"

---

### ✅ **Submit Form**

```javascript
case "submit_form":
  const form = document.querySelector("form");
  form.requestSubmit();
```

**Voice examples:**

- "submit form"
- "send form"

---

### ✅ **Book Appointment**

```javascript
case "book_appointment":
  alert("✅ Appointment booked successfully!");
  speak("Your appointment has been booked");
```

**Voice examples:**

- "book appointment"
- "confirm appointment"

---

### ✅ **Show/Hide Commands**

```javascript
case "show_commands":
  setShowCommands(true);

case "close_commands":
  setShowCommands(false);
```

**Voice examples:**

- "show commands"
- "close commands"

---

### ✅ **Refresh Page**

```javascript
case "refreshPage":
  window.location.reload();
```

**Voice examples:**

- "refresh page"
- "reload"

---

### ✅ **Change Wake Word**

```javascript
case "changeWakeWord":
  setWakeWord(params.wakeWord.toLowerCase());
  speak(`Wake word changed to ${params.wakeWord}`);
```

**Voice examples:**

- "change wake word to jarvis"
- "call you alexa"

---

### ✅ **Stop Listening**

```javascript
if (transcript.includes("stop")) {
  isActivatedRef.current = false;
  speak(`Assistant stopped. Say "${wakeWord}" to start again.`);
}
```

**Voice example:**

- "stop"

---

## Integration Steps

### Step 1: Update Backend NLP Router

Your backend needs to handle all these commands. Update `backend/utils/command_router.py`:

```python
# Already handles:
✅ navigate_page
✅ fill_field
✅ clear_field
✅ scroll_up/scroll_down
✅ check_box
✅ submit_form
✅ book_appointment
✅ show_commands/close_commands
✅ refresh_page

# Need to add:
❌ changeWakeWord (currently missing)
❌ stop_listening (currently missing)
```

### Step 2: Add Missing Backend Patterns

Add to `backend/utils/command_router.py`:

```python
# Stop listening pattern
stop_patterns = [
    [{"LOWER": "stop"}],
    [{"LOWER": "pause"}],
    [{"LOWER": "sleep"}]
]
matcher.add("stop_listening", stop_patterns)

# Change wake word pattern (already exists as "rename_assistant")
# Just need to handle it in route_command()
```

### Step 3: Update Frontend to Handle Actions

Your current `VoiceAssistant.jsx` just displays transcripts. You need to add action handling.

**Current flow:**

```
Whisper transcript → Display in widget ❌ (no actions)
```

**Need:**

```
Whisper transcript → Send to backend /parse → Execute action ✅
```

---

## Code Changes Needed

### 1. Frontend: Add Action Handler

Add this function to your current `VoiceAssistant.jsx`:

```javascript
const handleAction = async (transcript) => {
  try {
    // Send transcript to backend NLP
    const res = await fetch(`${getBackendBaseUrl()}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: transcript }),
    });

    const data = await res.json();

    if (data.status === "error") {
      console.warn("Unknown command:", transcript);
      return;
    }

    const { action, ...params } = data;

    // Execute action
    switch (action) {
      case "navigate":
        navigate(`/${params.page}`);
        break;

      case "fill_field":
        // Format value (email, date, time, capitalization)
        let formattedValue = formatFieldValue(params.field, params.value);
        setFieldValue(currentFormKey, params.field, formattedValue);
        break;

      case "clear_field":
        setFieldValue(currentFormKey, params.field, "");
        break;

      case "scroll_up":
        window.scrollBy({ top: -300, behavior: "smooth" });
        break;

      case "scroll_down":
        window.scrollBy({ top: 300, behavior: "smooth" });
        break;

      case "check_box":
        Object.entries(params.data || {}).forEach(([field, val]) => {
          setFieldValue(currentFormKey, field, true);
        });
        break;

      case "submit_form":
        document.querySelector("form")?.requestSubmit();
        break;

      case "book_appointment":
        alert("✅ Appointment booked!");
        document.querySelector("form")?.requestSubmit();
        break;

      case "show_commands":
        setShowCommands(true);
        break;

      case "close_commands":
        setShowCommands(false);
        break;

      case "refresh_page":
        window.location.reload();
        break;

      default:
        console.warn(`Unknown action: ${action}`);
    }
  } catch (err) {
    console.error("Action handler error:", err);
  }
};
```

### 2. Frontend: Call Action Handler on Transcript

Update your `mediaRecorderRef.current.onstop` handler:

```javascript
mediaRecorderRef.current.onstop = async () => {
  const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
  audioChunksRef.current = [];

  if (!listeningRef.current || isWaitingForWakeWordRef.current) return;
  if (audioBlob.size < 10000) {
    restartRecording();
    return;
  }

  try {
    // 1. Send to Whisper for transcription
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    const response = await fetch(
      `${getBackendBaseUrl()}/api/whisper-transcribe`,
      { method: "POST", body: formData }
    );

    if (response.ok) {
      const data = await response.json();
      const text = data.transcript || "";

      if (text && text.trim().length > 0) {
        // 2. Update transcript display
        setTranscript((prev) => prev + " " + text);

        // 3. Execute command ✅ NEW
        await handleAction(text);
      }

      restartRecording();
    }
  } catch (error) {
    console.error("❌ Transcription error:", error);
  }
};
```

### 3. Backend: Add `/parse` Endpoint

Your backend already has `/api/whisper-transcribe`. Add `/parse`:

```python
# backend/demo.py

from utils.command_router import get_intent_and_entities, route_command

@app.route('/parse', methods=['POST'])
def parse_command():
    """NLP endpoint - same as your old project"""
    data = request.json
    text = data.get('text', '')

    if not text:
        return jsonify({'status': 'error', 'message': 'No text provided'}), 400

    print(f"📝 Parsing command: '{text}'")

    # Use hybrid spaCy + Ollama
    intent, entities = get_intent_and_entities(text, use_ollama=True)
    result = route_command(intent, entities)

    print(f"✅ Result: {result}")
    return jsonify(result)
```

### 4. Add Field Formatting Utility

Port your smart formatting logic:

```javascript
// voice-assist/src/utils/fieldFormatter.js

export const formatFieldValue = (field, value) => {
  const fieldLower = field.toLowerCase();

  // Email formatting
  if (fieldLower === "email") {
    // "tejas google" → "tejas@gmail.com"
    const parts = value.trim().split(/\s+/);
    if (parts.length === 2) {
      const [name, provider] = parts;
      const domains = {
        google: "gmail.com",
        yahoo: "yahoo.com",
        outlook: "outlook.com",
        hotmail: "hotmail.com",
        harris: "harriscomputer.com",
      };
      if (domains[provider.toLowerCase()]) {
        return `${name}@${domains[provider.toLowerCase()]}`;
      }
    }
    // Normalize: "at" → "@", "dot" → "."
    return value
      .replace(/\s+/g, "")
      .replace(/ at /gi, "@")
      .replace(/ dot /gi, ".")
      .replace(/dash/gi, "-")
      .replace(/underscore/gi, "_");
  }

  // Date formatting
  if (fieldLower === "date") {
    const parsedDate = new Date(value);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split("T")[0]; // YYYY-MM-DD
    }
  }

  // Time formatting
  if (fieldLower === "time") {
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

  // Name/text capitalization
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};
```

---

## Testing Commands

Once integrated, test each command:

### Navigation

```
Say: "Java" (wake word)
Then: "go to profile"
Expected: Navigate to /profile
```

### Fill Field

```
Say: "Java"
Then: "enter John Smith in name"
Expected: Name field = "John Smith"
```

### Email Auto-complete

```
Say: "Java"
Then: "type tejas google"
Expected: Email field = "tejas@gmail.com"
```

### Date

```
Say: "Java"
Then: "set appointment date 23 december 2025"
Expected: Date field = "2025-12-23"
```

### Time

```
Say: "Java"
Then: "set time 2 pm"
Expected: Time field = "14:00"
```

### Scroll

```
Say: "Java"
Then: "scroll down"
Expected: Page scrolls 300px down
```

### Clear

```
Say: "Java"
Then: "clear name"
Expected: Name field = ""
```

### Submit

```
Say: "Java"
Then: "submit form"
Expected: Form submits
```

---

## Summary

**What you had (Web Speech API):**

- ✅ 11 command types
- ✅ Smart field formatting
- ✅ React Router navigation
- ✅ Form context integration

**What you need to add to current project:**

1. ✅ Backend `/parse` endpoint (calls command_router.py)
2. ✅ Frontend `handleAction()` function
3. ✅ Field formatting utility
4. ✅ Call `handleAction()` after each Whisper transcript

**Benefits of migration:**

- Keep all your existing commands
- Gain better accuracy (Whisper vs Web Speech)
- Stay HIPAA-compliant (local processing)
- Add Ollama for natural language variations

---

Want me to implement these changes in your current project now?
