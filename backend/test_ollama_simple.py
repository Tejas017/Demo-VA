"""
Simple Ollama Test - Run this to see if Ollama can help your voice assistant

Prerequisites:
1. Install Ollama: winget install Ollama.Ollama
2. Pull model: ollama pull llama3.2:latest
3. Install requests: pip install requests
"""

import requests
import json
import time

def test_ollama(text):
    """Send a voice command to Ollama and see what it extracts"""
    
    prompt = f"""You are a voice assistant for a medical appointment system.
User said: "{text}"

Extract the intent and any relevant data.

Available intents:
- navigate_page: Go to a page
- fill_field: Enter data in a form
- check_box: Select checkboxes
- submit_form: Submit form
- book_appointment: Book appointment
- scroll_up/scroll_down: Scroll page
- clear_field: Clear a field
- refresh_page: Reload page

Respond ONLY with JSON:
{{"intent": "action_name", "entities": {{"field": "value"}}}}

Example:
User: "my name is John Smith"
{{"intent": "fill_field", "entities": {{"field": "name", "value": "John Smith"}}}}

Now process: "{text}"
"""
    
    print(f"\n📝 Testing: '{text}'")
    print("⏳ Asking Ollama...")
    
    try:
        start = time.time()
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "gemma3:1b",
                "prompt": prompt,
                "stream": False,
                "temperature": 0.1,
            },
            timeout=10
        )
        latency = (time.time() - start) * 1000
        
        if response.ok:
            result = response.json()
            raw_output = result.get("response", "")
            
            print(f"\n🤖 Ollama's raw response:")
            print(raw_output)
            
            # Try to extract JSON
            import re
            json_match = re.search(r'\{.*\}', raw_output, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                intent = parsed.get("intent")
                entities = parsed.get("entities", {})
                
                print(f"\n✅ Extracted:")
                print(f"   Intent: {intent}")
                print(f"   Entities: {json.dumps(entities, indent=2)}")
                print(f"   Latency: {latency:.0f}ms")
                
                return True
            else:
                print("\n❌ Could not find JSON in response")
                return False
        else:
            print(f"\n❌ HTTP Error: {response.status_code}")
            return False
    
    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Ollama is not running!")
        print("\n💡 Start Ollama with: ollama serve")
        print("   Or check if it's already running: curl http://localhost:11434/api/tags")
        return False
    
    except requests.exceptions.Timeout:
        print("\n❌ Error: Ollama took too long (>10s)")
        print("💡 Try a smaller model: ollama pull llama3.2:1b")
        return False
    
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False


def main():
    print("=" * 70)
    print("Ollama Voice Assistant Test")
    print("=" * 70)
    
    # Test commands that spaCy struggles with
    test_commands = [
        # Natural variations
        "my name is Sarah Johnson",
        "put Dr. Smith as my doctor",
        "I'd like to book an appointment",
        
        # Complex queries
        "schedule me for next Monday at 2pm",
        "can you clear the address field please",
        "I want to see a cardiologist",
        
        # Simple (spaCy already handles these)
        "scroll down",
        "submit form",
        "enter John in name field",
    ]
    
    success_count = 0
    
    for cmd in test_commands:
        if test_ollama(cmd):
            success_count += 1
        print("\n" + "-" * 70)
    
    print("\n" + "=" * 70)
    print(f"RESULTS: {success_count}/{len(test_commands)} commands understood")
    print("=" * 70)
    
    if success_count >= len(test_commands) * 0.8:
        print("\n✅ Ollama is working great! Consider adding it as fallback.")
        print("   → See OLLAMA_SETUP.md for integration guide")
    elif success_count > 0:
        print("\n⚠️ Ollama works but needs tuning.")
        print("   → Try a different model: ollama pull llama3.1:8b")
    else:
        print("\n❌ Ollama not available or having issues.")
        print("   → Check if Ollama is running: ollama serve")


if __name__ == "__main__":
    main()
