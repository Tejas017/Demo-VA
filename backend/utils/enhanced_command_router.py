"""
Enhanced Command Router with Ollama fallback for complex queries
"""
import spacy
import re
import json
from spacy.matcher import Matcher
from config.form_map import formMap

# Load spaCy
nlp = spacy.load("en_core_web_sm")
matcher = Matcher(nlp.vocab)

# ============================================
# PATTERN MATCHING (Fast, deterministic)
# ============================================

# Navigation patterns
navigate_patterns = [
    [{"LOWER": "go"}, {"LOWER": "to"}, {"POS": "DET", "OP": "?"}, {"POS": "NOUN"}],
    [{"LOWER": "open"}, {"POS": "NOUN"}],
    [{"LOWER": "navigate"}, {"LOWER": "to"}, {"POS": "NOUN"}]
]
matcher.add("navigate_page", navigate_patterns)

# Fill patterns
fill_patterns = [
    [{"LOWER": "fill"}, {"POS": "DET", "OP": "?"}, {"POS": "NOUN"}, {"LOWER": "with"}, {"POS": "NOUN"}],
    [{"LOWER": "enter"}, {"POS": "PROPN", "OP": "+"}, {"LOWER": "in"}, {"POS": "NOUN"}],
    [{"LOWER": "type"}, {"POS": "PROPN", "OP": "+"}, {"LOWER": "in"}, {"POS": "NOUN"}],
]
matcher.add("fill_field", fill_patterns)

# Submit patterns
submit_patterns = [
    [{"LOWER": {"IN": ["submit", "send", "apply"]}}, {"LOWER": "form"}]
]
matcher.add("submit_form", submit_patterns)

# Scroll patterns
scroll_patterns = [
    [{"LOWER": "scroll"}, {"LOWER": {"IN": ["up", "down"]}}],
    [{"LOWER": "move"}, {"LOWER": {"IN": ["up", "down"]}}]
]
matcher.add("scroll_page", scroll_patterns)

# Checkbox patterns
check_patterns = [
    [{"LOWER": {"IN": ["check", "tick", "select"]}}, {"POS": "PROPN", "OP": "+"}, {"LOWER": "in"}, {"POS": "NOUN"}],
    [{"LOWER": "mark"}, {"POS": "PROPN", "OP": "+"}, {"LOWER": "under"}, {"POS": "NOUN"}]
]
matcher.add("check_box", check_patterns)

# Book appointment patterns
book_patterns = [
    [{"LOWER": "book"}, {"LOWER": "appointment"}],
    [{"LOWER": "confirm"}, {"LOWER": "appointment"}],
    [{"LOWER": "schedule"}, {"LOWER": "appointment"}]
]
matcher.add("book_appointment", book_patterns)

# Refresh patterns
refresh_patterns = [
    [{"LOWER": {"IN": ["refresh", "reload"]}}, {"LOWER": "page", "OP": "?"}]
]
matcher.add("refresh_page", refresh_patterns)

# Stop listening pattern
stop_patterns = [
    [{"LOWER": "stop"}],
    [{"LOWER": "pause"}],
    [{"LOWER": "sleep"}]
]
matcher.add("stop_listening", stop_patterns)

# Dropdown patterns
dropdown_patterns = [
    [{"LOWER": {"IN": ["open", "show", "expand"]}}, {"POS": "NOUN"}, {"LOWER": "dropdown"}],
    [{"LOWER": {"IN": ["open", "show"]}}, {"LOWER": "dropdown"}, {"POS": "NOUN"}],
]
matcher.add("open_dropdown", dropdown_patterns)

# Select dropdown option patterns
select_patterns = [
    [{"LOWER": {"IN": ["select", "choose", "pick"]}}, {"POS": "PROPN", "OP": "+"}],
]
matcher.add("select_option", select_patterns)


def get_mapped_field(entity_label):
    """Map entity label to form field using formMap"""
    normalized = re.sub(r'[^a-z0-9]', '', entity_label.lower())
    return formMap.get(normalized, normalized)


# ============================================
# PATTERN-BASED INTENT DETECTION
# ============================================

def detect_intent_spacy(text):
    """Fast pattern matching for common commands"""
    doc = nlp(text)
    matches = matcher(doc)
    
    print(f"🔍 Analyzing: '{text}'")
    
    # Clear field command
    if text.lower().startswith("clear "):
        words = text.lower().split()
        if len(words) > 1:
            field = words[-1].rstrip(".?!")
            field = re.sub(r'[^\w\s]', '', field)
            return "clear_field", {"field": field}
    
    # Fill field using regex (more flexible)
    # Pattern 1: "type VALUE in FIELD" or "enter VALUE in FIELD"
    fill_match = re.search(r'(?:enter|type|set|put)\s+(.*?)\s+(?:in|into|as|for)\s+(.*?)[.?!]?$', text, re.IGNORECASE)
    if fill_match:
        value = fill_match.group(1).strip()
        label = fill_match.group(2).strip().rstrip(".?!")
        label = re.sub(r'[^a-z0-9]', '', label.lower())
        print(f"✅ Pattern 1 match: field='{label}', value='{value}'")
        return "fill", {"label": label, "value": value}
    
    # Pattern 2: "write in FIELD that VALUE" or "write in FIELD VALUE"
    write_match = re.search(r'(?:write|add)\s+(?:in|into|to)\s+(\w+)\s+(?:that\s+)?(.*)', text, re.IGNORECASE)
    if write_match:
        label = write_match.group(1).strip().rstrip(".?!")
        value = write_match.group(2).strip().rstrip(".?!")
        label = re.sub(r'[^a-z0-9]', '', label.lower())
        print(f"✅ Pattern 2 match: field='{label}', value='{value}'")
        return "fill", {"label": label, "value": value}
    
    # Checkbox detection
    if any(w in text.lower() for w in ["check", "tick", "select", "mark", "uncheck"]):
        action_type = "check" if any(w in text.lower() for w in ["check", "tick", "select", "mark"]) else "uncheck"
        parts = re.split(r'\s+in\s+|\s+under\s+', text.lower(), 1)
        if len(parts) == 2:
            checkbox_label = parts[0].replace("check", "").replace("uncheck", "").strip()
            form = get_mapped_field(parts[1].strip())
            return "check_box", {
                "checkbox_action": action_type,
                "data": {form: [checkbox_label]}
            }
    
    # Scroll detection
    if "scroll" in text.lower() or "move" in text.lower():
        if "up" in text.lower():
            return "scroll_up", {}
        elif "down" in text.lower():
            return "scroll_down", {}
    
    # Stop detection
    if text.lower().strip() in ["stop", "pause", "sleep"]:
        return "stop_listening", {}

    # Dictation specific controls: continue/start/stop/clear/open dictation
    dict_continue_match = re.search(r'continue in\s+(notes|summary|message)', text, re.IGNORECASE)
    if dict_continue_match:
        area = dict_continue_match.group(1).lower()
        return "dictation_control", {"op": "continue", "area": area}

    dict_start_match = re.search(r'(?:(?:start|begin|resume) (?:dictation|dictate))(?: in (notes|summary|message))?', text, re.IGNORECASE)
    if dict_start_match:
        area = dict_start_match.group(1).lower() if dict_start_match.group(1) else ""
        return "dictation_control", {"op": "start", "area": area}

    if re.search(r'\b(stop|stop dictation|end dictation|pause dictation)\b', text, re.IGNORECASE):
        return "dictation_control", {"op": "stop", "area": ""}

    if re.search(r'\b(open|go to|navigate to)\s+dictation\b', text, re.IGNORECASE):
        return "navigate_page", {"page": "dictation"}

    clear_dict_match = re.search(r'clear\s+(notes|summary|message)\b', text, re.IGNORECASE)
    if clear_dict_match:
        area = clear_dict_match.group(1).lower()
        return "dictation_control", {"op": "clear", "area": area}
    
    # Show/close commands
    if "show command" in text.lower():
        return "show_commands", {}
    if "close command" in text.lower():
        return "close_commands", {}

    # Show numbered inputs: "show numbers", "number the fields", "number inputs"
    if re.search(r'\b(show|display|number|label)\b.*\b(number|numbers|fields|inputs|inputs with numbers|label inputs)\b', text, re.IGNORECASE):
        return "show_numbers", {}
    
    # Dropdown open detection
    dropdown_open_match = re.search(r'(?:open|show|expand)\s+(.*?)\s+dropdown', text, re.IGNORECASE)
    if dropdown_open_match:
        field = dropdown_open_match.group(1).strip()
        field = re.sub(r'[^a-z0-9]', '', field.lower())
        return "open_dropdown", {"field": field}
    
    # Select dropdown option detection
    select_match = re.search(r'(?:select|choose|pick)\s+(.*?)(?:\s+from\s+dropdown)?[.?!]?$', text, re.IGNORECASE)
    if select_match and any(w in text.lower() for w in ["select", "choose", "pick"]):
        value = select_match.group(1).strip()
        return "select_option", {"value": value}
    
    # Pattern matcher results
    for match_id, start, end in matches:
        intent = nlp.vocab.strings[match_id]
        
        if intent == "navigate_page":
            for token in doc:
                if token.pos_ == "NOUN":
                    return "navigate_page", {"page": token.text}
        
        elif intent == "submit_form":
            return "submit_form", {}
        
        elif intent == "book_appointment":
            return "book_appointment", {}
        
        elif intent == "refresh_page":
            return "refresh_page", {}
        
        elif intent == "stop_listening":
            return "stop_listening", {}
        
        elif intent == "open_dropdown":
            for token in doc:
                if token.pos_ == "NOUN" and token.text.lower() != "dropdown":
                    return "open_dropdown", {"field": token.text.lower()}
        
        elif intent == "select_option":
            # Extract everything after select/choose/pick
            for i, token in enumerate(doc):
                if token.lower_ in ["select", "choose", "pick"]:
                    value = " ".join([t.text for t in doc[i+1:]])
                    return "select_option", {"value": value.strip()}
    
    # If no pattern matched, return None to trigger Ollama fallback
    return None, None


# ============================================
# OLLAMA INTEGRATION (for complex queries)
# ============================================

def detect_intent_ollama(text, available_actions=None):
    """
    Use Ollama for complex/conversational queries.
    Fallback when spaCy patterns fail.
    """
    try:
        import requests
        
        if available_actions is None:
            available_actions = [
                "navigate_page", "fill_field", "check_box", "submit_form",
                "book_appointment", "scroll_up", "scroll_down", "clear_field", "refresh_page"
            ]
        
        # Prompt for Ollama
        prompt = f"""You are a voice assistant for a medical appointment booking system.
User said: "{text}"

Available actions:
- navigate_page: Go to a specific page (home, profile, appointments, etc.)
- fill_field: Enter data in a form field
- check_box: Select checkboxes
- submit_form: Submit the current form
- book_appointment: Confirm appointment booking
- scroll_up/scroll_down: Scroll the page
- clear_field: Clear a form field
- refresh_page: Reload the page

Extract the intent and entities from the user's command.

Respond ONLY with valid JSON in this format:
{{
  "intent": "action_name",
  "entities": {{"field": "name", "value": "John"}}
}}

Examples:
User: "I want to make an appointment for next Monday"
{{"intent": "fill_field", "entities": {{"field": "date", "value": "next Monday"}}}}

User: "Put my name as Sarah Johnson"
{{"intent": "fill_field", "entities": {{"field": "name", "value": "Sarah Johnson"}}}}

User: "Go back to the main page"
{{"intent": "navigate_page", "entities": {{"page": "home"}}}}

Now analyze: "{text}"
"""
        
        # Call Ollama API (assumed running on localhost:11434)
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "gemma3:1b",  # or llama2, mistral, etc.
                "prompt": prompt,
                "stream": False,
                "temperature": 0.1,  # Low temp for consistent structured output
            },
            timeout=10  # Increased timeout for smaller models
        )
        
        if response.ok:
            result = response.json()
            raw_text = result.get("response", "")
            
            # Extract JSON from response (handle markdown code blocks)
            json_match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                intent = parsed.get("intent")
                entities = parsed.get("entities", {})
                print(f"🤖 Ollama detected: {intent} | {entities}")
                return intent, entities
        
        print("⚠️ Ollama failed to parse")
        return "unknown", {}
    
    except requests.exceptions.RequestException:
        print("⚠️ Ollama not available (is it running?)")
        return "unknown", {}
    except Exception as e:
        print(f"⚠️ Ollama error: {e}")
        return "unknown", {}


# ============================================
# MAIN ROUTING FUNCTION
# ============================================

def get_intent_and_entities(text, use_ollama=True):
    """
    Primary entry point. Tries spaCy first, falls back to Ollama.
    
    Args:
        text: User's voice command
        use_ollama: If True, use Ollama for unknown commands
    
    Returns:
        (intent, entities) tuple
    """
    # 1. Try fast pattern matching
    intent, entities = detect_intent_spacy(text)
    
    if intent:
        print(f"✅ Pattern match: {intent}")
        return intent, entities
    
    # 2. Fallback to Ollama for complex/conversational queries
    if use_ollama:
        print(f"🔄 No pattern match, trying Ollama...")
        intent, entities = detect_intent_ollama(text)
        if intent and intent != "unknown":
            return intent, entities
    
    # 3. Complete failure
    print(f"❌ Could not understand: {text}")
    return "unknown", {}


def route_command(intent, entities):
    """Convert intent + entities into action payload"""
    
    if intent == "fill" or intent == "fill_field":
        field = entities.get("field") or entities.get("label", "")
        field = re.sub(r'[^a-z0-9]', '', field.lower())
        value = entities.get("value")
        return {
            "status": "success",
            "action": "fill_field",
            "field": field,
            "value": value,
            "message": f"Filling {field} with '{value}'"
        }
    
    elif intent == "clear_field":
        field = get_mapped_field(entities.get("field"))
        return {
            "status": "success",
            "action": "clear_field",
            "field": field,
            "message": f"Clearing {field}"
        }
    
    elif intent == "navigate_page":
        page = entities.get("page", "").lower()
        # Handle common singular/plural variations
        page_map = {
            "appointment": "appointments",
            "contact": "contact",
            "profile": "profile",
            "home": "home"
        }
        page = page_map.get(page, page)
        return {
            "status": "success",
            "action": "navigate",
            "page": page,
            "message": f"Navigating to {page}"
        }
    
    elif intent == "check_box":
        return {
            "status": "success",
            "action": "check_box",
            "checkbox_action": entities.get("checkbox_action", "check"),
            "data": entities.get("data", {}),
            "message": f"Checking boxes"
        }
    
    elif intent == "submit_form":
        return {
            "status": "success",
            "action": "submit_form",
            "message": "Submitting form"
        }
    
    elif intent == "book_appointment":
        return {
            "status": "success",
            "action": "book_appointment",
            "message": "Booking appointment"
        }
    
    elif intent in ("scroll_up", "scroll_down"):
        return {
            "status": "success",
            "action": intent,
            "message": f"Scrolling {intent.split('_')[1]}"
        }
    
    elif intent == "refresh_page":
        return {
            "status": "success",
            "action": "refresh_page",
            "message": "Reloading page"
        }
    
    elif intent == "stop_listening":
        return {
            "status": "success",
            "action": "stop_listening",
            "message": "Stopping assistant"
        }
    
    elif intent in ("show_commands", "close_commands"):
        return {
            "status": "success",
            "action": intent,
            "message": f"{intent.replace('_', ' ').title()}"
        }
    
    elif intent == "open_dropdown":
        field = entities.get("field", "")
        return {
            "status": "success",
            "action": "open_dropdown",
            "field": field,
            "message": f"Opening {field} dropdown"
        }

    elif intent == "show_numbers":
        return {
            "status": "success",
            "action": "show_numbers",
            "message": "Showing numbered inputs on the page"
        }
    
    elif intent == "select_option":
        value = entities.get("value", "")
        return {
            "status": "success",
            "action": "select_option",
            "value": value,
            "message": f"Selecting {value}"
        }
    
    return {
        "status": "error",
        "message": f"Unknown intent: {intent}"
    }

