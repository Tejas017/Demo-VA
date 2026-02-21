"""
Test script to verify "write in message" command parsing
"""
import sys
sys.path.append('.')

from utils.enhanced_command_router import detect_intent_spacy, route_command

# Test cases
test_commands = [
    "write in message that we have to complete the task",
    "write in message we have to complete the task",
    "type hello world in message",
    "enter test message in message",
    "add to message that this is a test"
]

print("=" * 60)
print("Testing 'write in message' command patterns")
print("=" * 60)

for cmd in test_commands:
    print(f"\n📝 Testing: '{cmd}'")
    intent, entities = detect_intent_spacy(cmd)
    
    if intent:
        result = route_command(intent, entities)
        print(f"   ✅ Intent: {intent}")
        print(f"   📦 Entities: {entities}")
        print(f"   🎯 Result: {result}")
    else:
        print(f"   ❌ No match found")

print("\n" + "=" * 60)
