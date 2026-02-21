"""
Quick test script to compare spaCy vs Ollama performance
Run: python test_nlp_comparison.py
"""

import time
import json

# Test commands (real examples from voice assistant)
TEST_COMMANDS = [
    # Simple (spaCy should win)
    "scroll down",
    "submit form",
    "refresh page",
    "enter John in name field",
    
    # Variations (Ollama should win)
    "my name is Sarah Johnson",
    "put Dr. Smith as my doctor",
    "I'd like to book an appointment",
    "can you clear the address field",
    
    # Complex (Ollama should win)
    "schedule a checkup for next Monday at 2pm",
    "I want to see a cardiologist sometime next week",
    "fill in my details from my last visit",
]


def test_spacy(text):
    """Test with current spaCy patterns"""
    try:
        from utils.enhanced_command_router import get_intent_and_entities
        start = time.time()
        intent, entities = get_intent_and_entities(text)
        latency = (time.time() - start) * 1000
        return {
            "success": intent != "unknown",
            "intent": intent,
            "entities": entities,
            "latency_ms": round(latency, 2)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def test_ollama(text):
    """Test with Ollama"""
    try:
        import requests
        
        prompt = f"""Extract intent and entities from: "{text}"

Available intents: navigate_page, fill_field, check_box, submit_form, book_appointment, scroll_up, scroll_down, clear_field, refresh_page

Respond ONLY with JSON:
{{"intent": "action_name", "entities": {{"field": "value"}}}}"""
        
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
            raw = result.get("response", "")
            
            # Extract JSON
            import re
            json_match = re.search(r'\{.*\}', raw, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                return {
                    "success": True,
                    "intent": parsed.get("intent"),
                    "entities": parsed.get("entities", {}),
                    "latency_ms": round(latency, 2)
                }
        
        return {"success": False, "error": "Failed to parse Ollama response", "latency_ms": round(latency, 2)}
    
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": "Ollama not running (start with: ollama serve)"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def print_result(method, result):
    """Pretty print result"""
    status = "✅" if result.get("success") else "❌"
    intent = result.get("intent", "unknown")
    latency = result.get("latency_ms", 0)
    error = result.get("error", "")
    
    if result.get("success"):
        entities_str = json.dumps(result.get("entities", {}))
        print(f"  {status} {method:8s} → {intent:20s} {entities_str:30s} ({latency}ms)")
    else:
        print(f"  {status} {method:8s} → {error}")


def main():
    print("=" * 80)
    print("NLP Comparison: spaCy vs Ollama")
    print("=" * 80)
    print()
    
    spacy_wins = 0
    ollama_wins = 0
    
    for cmd in TEST_COMMANDS:
        print(f"Command: '{cmd}'")
        
        # Test spaCy
        spacy_result = test_spacy(cmd)
        print_result("spaCy", spacy_result)
        
        # Test Ollama
        ollama_result = test_ollama(cmd)
        print_result("Ollama", ollama_result)
        
        # Determine winner
        if spacy_result.get("success") and not ollama_result.get("success"):
            spacy_wins += 1
            print("  🏆 Winner: spaCy (only one that worked)")
        elif ollama_result.get("success") and not spacy_result.get("success"):
            ollama_wins += 1
            print("  🏆 Winner: Ollama (only one that worked)")
        elif spacy_result.get("success") and ollama_result.get("success"):
            # Both worked, compare latency
            if spacy_result["latency_ms"] < ollama_result["latency_ms"]:
                spacy_wins += 1
                print(f"  🏆 Winner: spaCy (faster by {ollama_result['latency_ms'] - spacy_result['latency_ms']:.0f}ms)")
            else:
                ollama_wins += 1
                print(f"  🏆 Winner: Ollama (more accurate or similar speed)")
        else:
            print("  ⚠️ Both failed")
        
        print()
    
    print("=" * 80)
    print(f"RESULTS: spaCy {spacy_wins} | Ollama {ollama_wins}")
    print("=" * 80)
    print()
    
    if spacy_wins > ollama_wins: 
        print("✅ Recommendation: Keep spaCy-only (fast enough and accurate)")
    elif ollama_wins > spacy_wins * 1.5:
        print("✅ Recommendation: Use Ollama fallback (handles variations better)")
    else:
        print("✅ Recommendation: Use HYBRID (spaCy for simple, Ollama for complex)")


if __name__ == "__main__":
    main()
